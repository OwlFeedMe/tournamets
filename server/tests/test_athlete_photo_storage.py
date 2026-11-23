import io
import os
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from PIL import Image
from services import athlete_photo_storage as storage


class AthletePhotoStorageTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'APP_ENV': 'stage', 'SPACES_BUCKET': 'test'})
        self.env.start()
        self.client = MagicMock()
        self.config = patch.object(storage.open_video_storage, 'configured', return_value=True)
        self.mock = patch.object(storage.open_video_storage, 'client', return_value=self.client)
        self.config.start(); self.mock.start()

    def tearDown(self):
        self.mock.stop(); self.config.stop(); self.env.stop()

    def image(self):
        output = io.BytesIO()
        image = Image.new('RGB', (320, 480), '#FF6B00')
        exif = Image.Exif(); exif[270] = 'Private metadata'
        image.save(output, format='JPEG', exif=exif)
        output.seek(0)
        return output

    def test_private_full_resolution_image_without_metadata(self):
        key = storage.save(24, 123, self.image())
        self.assertTrue(key.startswith('athlete-photos/stage/24/123/'))
        args = self.client.put_object.call_args.kwargs
        self.assertEqual(args['ACL'], 'private')
        self.assertEqual(args['ContentType'], 'image/jpeg')
        with Image.open(io.BytesIO(args['Body'])) as image:
            self.assertEqual(image.size, (320, 480))
            self.assertFalse(image.getexif())

    def test_rejects_invalid_and_oversized_files_before_storage(self):
        for raw in [b'<svg></svg>', b'not an image', b'x' * (storage.MAX_BYTES + 1)]:
            with self.assertRaises(HTTPException): storage.save(24, 123, io.BytesIO(raw))
        self.client.put_object.assert_not_called()

    def test_urls_are_short_lived_and_scoped_to_owner_event_and_environment(self):
        key = 'athlete-photos/stage/24/123/' + 'a' * 32 + '.jpg'
        storage.photo_url(24, 123, key)
        self.assertEqual(self.client.generate_presigned_url.call_args.kwargs['ExpiresIn'], 300)
        for wrong in [key.replace('/123/', '/124/'), key.replace('/24/', '/25/'), key.replace('/stage/', '/production/')]:
            with self.assertRaises(HTTPException): storage.photo_url(24, 123, wrong)

    def test_storage_failure_never_reports_a_successful_upload(self):
        self.client.put_object.side_effect = RuntimeError('offline')
        with self.assertRaises(HTTPException) as error: storage.save(24, 123, self.image())
        self.assertEqual(error.exception.status_code, 503)
