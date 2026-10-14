"""Private Open videos in DigitalOcean Spaces (S3-compatible API)."""
import os
import re
import uuid
from pathlib import Path

from fastapi import HTTPException

MAX_BYTES = 1024 * 1024 * 1024
TYPES = {'.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm'}


def configured():
    return all(os.getenv(key) for key in ('SPACES_BUCKET', 'SPACES_REGION', 'SPACES_ACCESS_KEY_ID', 'SPACES_SECRET_ACCESS_KEY'))


def client():
    if not configured():
        raise HTTPException(503, 'La carga de videos no está disponible. Puedes guardar el enlace del video.')
    import boto3
    from botocore.config import Config
    region = os.environ['SPACES_REGION']
    return boto3.client('s3', endpoint_url=f'https://{region}.digitaloceanspaces.com', region_name=region,
                        aws_access_key_id=os.environ['SPACES_ACCESS_KEY_ID'],
                        aws_secret_access_key=os.environ['SPACES_SECRET_ACCESS_KEY'],
                        config=Config(signature_version='s3v4', connect_timeout=10, read_timeout=60, retries={'max_attempts': 2}))


def prefix(competition_id, user_id):
    env = os.getenv('APP_ENV', 'development').lower()
    return f'open-videos/{env}/{competition_id}/{user_id}/'


def prepare(competition_id, user_id, filename, size):
    extension = Path(filename).suffix.lower()
    if extension not in TYPES:
        raise HTTPException(400, 'Usa un video MP4, MOV o WebM')
    if not 0 < size <= MAX_BYTES:
        raise HTTPException(413, 'El video debe pesar entre 1 byte y 1 GB')
    key = prefix(competition_id, user_id) + 'pending/' + uuid.uuid4().hex + extension
    content_type = TYPES[extension]
    upload = client().generate_presigned_post(Bucket=os.environ['SPACES_BUCKET'], Key=key,
        Fields={'acl': 'private', 'Content-Type': content_type},
        Conditions=[{'acl': 'private'}, {'Content-Type': content_type}, ['content-length-range', size, size]], ExpiresIn=3600)
    return {'key': key, 'upload': upload, 'max_bytes': MAX_BYTES}


def finalize(competition_id, user_id, key):
    expected = re.escape(prefix(competition_id, user_id)) + r'pending/[a-f0-9]{32}\.(mp4|mov|webm)'
    if not re.fullmatch(expected, key):
        raise HTTPException(400, 'El video cargado no pertenece a esta entrega')
    storage = client()
    bucket = os.environ['SPACES_BUCKET']
    try:
        info = storage.head_object(Bucket=bucket, Key=key)
        if not 0 < info['ContentLength'] <= MAX_BYTES or info.get('ContentType') != TYPES[Path(key).suffix]:
            raise HTTPException(400, 'El archivo no es un video compatible o excede 1 GB')
        response = storage.get_object(Bucket=bucket, Key=key, Range='bytes=0-15', IfMatch=info['ETag'])
        body = response['Body']
        try:
            header = body.read(16)
        finally:
            body.close()
        valid = header[:4] == b'\x1aE\xdf\xa3' if key.endswith('.webm') else header[4:8] == b'ftyp'
        if not valid:
            raise HTTPException(400, 'El archivo cargado no es un video compatible')
        # A signed upload can be reused until it expires. Freeze the submitted copy.
        final_key = prefix(competition_id, user_id) + 'submitted/' + uuid.uuid4().hex + Path(key).suffix
        storage.copy_object(Bucket=bucket, Key=final_key, CopySource={'Bucket': bucket, 'Key': key},
                            CopySourceIfMatch=info['ETag'], ACL='private')
        return final_key
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(503, 'No pudimos verificar el video. Espera a que termine la carga e intenta guardar de nuevo.') from error


def playback_url(key):
    if not key or not configured():
        return None
    return client().generate_presigned_url('get_object', Params={'Bucket': os.environ['SPACES_BUCKET'], 'Key': key}, ExpiresIn=1800)
