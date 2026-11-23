"""Full-resolution competition photos; never public profile images."""
import io
import os
import re
import uuid
import warnings

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from services import open_video_storage

MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 40_000_000
URL_SECONDS = 300


def prefix(competition_id, user_id):
    environment = os.getenv('APP_ENV', 'development').lower()
    return f'athlete-photos/{environment}/{competition_id}/{user_id}/'


def save(competition_id, user_id, stream):
    if not open_video_storage.configured():
        raise HTTPException(503, 'La carga de fotos no está disponible. Intenta más tarde.')
    raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, 'La foto debe pesar como máximo 10 MB')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {'JPEG', 'PNG', 'WEBP'} or getattr(image, 'n_frames', 1) != 1:
                    raise HTTPException(400, 'Usa una foto JPG, PNG o WebP sin animación')
                if image.width * image.height > MAX_PIXELS:
                    raise HTTPException(413, 'La foto debe tener como máximo 40 megapíxeles')
                # Apply orientation before stripping EXIF; retain dimensions, without cropping.
                image = ImageOps.exif_transpose(image).convert('RGB')
                output = io.BytesIO()
                image.save(output, format='JPEG', quality=95, subsampling=0)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise HTTPException(400, 'No se pudo leer la foto. Usa JPG, PNG o WebP.') from error
    key = prefix(competition_id, user_id) + uuid.uuid4().hex + '.jpg'
    try:
        open_video_storage.client().put_object(Bucket=os.environ['SPACES_BUCKET'], Key=key,
                                               Body=output.getvalue(), ContentType='image/jpeg', ACL='private')
    except Exception as error:
        raise HTTPException(503, 'No pudimos guardar la foto. Intenta nuevamente.') from error
    return key


def photo_url(competition_id, user_id, key):
    if not key:
        return None
    if not re.fullmatch(re.escape(prefix(competition_id, user_id)) + r'[a-f0-9]{32}\.jpg', key):
        raise HTTPException(409, 'La foto no pertenece a esta participación')
    if not open_video_storage.configured():
        return None
    return open_video_storage.client().generate_presigned_url('get_object', Params={
        'Bucket': os.environ['SPACES_BUCKET'], 'Key': key}, ExpiresIn=URL_SECONDS)
