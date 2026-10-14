import io
import os
import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from services import open_video_storage as storage


class OpenVideoStorageTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'APP_ENV': 'stage', 'SPACES_BUCKET': 'test'})
        self.env.start()
        self.client = MagicMock()
        self.mock = patch.object(storage, 'client', return_value=self.client)
        self.mock.start()

    def tearDown(self):
        self.mock.stop(); self.env.stop()

    def test_presigned_upload_is_private_size_limited_and_owner_scoped(self):
        result = storage.prepare(24, 123, 'my workout.MP4', 100)
        self.assertTrue(result['key'].startswith('open-videos/stage/24/123/pending/'))
        args = self.client.generate_presigned_post.call_args.kwargs
        self.assertIn(['content-length-range', 100, 100], args['Conditions'])
        self.assertEqual(args['Fields']['acl'], 'private')
        for filename, size in [('bad.txt', 10), ('good.mp4', 0), ('good.mp4', storage.MAX_BYTES + 1)]:
            with self.assertRaises(HTTPException): storage.prepare(24, 123, filename, size)

    def test_rejects_other_athlete_competition_environment_or_final_object(self):
        for key in ['open-videos/stage/24/124/pending/', 'open-videos/stage/25/123/pending/', 'open-videos/production/24/123/pending/', 'open-videos/stage/24/123/submitted/']:
            with self.assertRaises(HTTPException): storage.finalize(24, 123, key + 'a' * 32 + '.mp4')
        self.client.head_object.assert_not_called()

    def test_checks_video_and_freezes_submission_copy(self):
        key = 'open-videos/stage/24/123/pending/' + 'a' * 32 + '.mp4'
        self.client.head_object.return_value = {'ContentLength': 100, 'ContentType': 'video/mp4', 'ETag': 'etag'}
        self.client.get_object.return_value = {'Body': io.BytesIO(b'0000ftyp' + b'0' * 8)}
        final = storage.finalize(24, 123, key)
        self.assertTrue(final.startswith('open-videos/stage/24/123/submitted/'))
        args = self.client.copy_object.call_args.kwargs
        self.assertEqual(args['ACL'], 'private')
        self.assertEqual(args['CopySourceIfMatch'], 'etag')
        self.client.get_object.return_value = {'Body': io.BytesIO(b'not a video')}
        with self.assertRaises(HTTPException): storage.finalize(24, 123, key)

    def test_missing_upload_does_not_become_submitted(self):
        self.client.head_object.side_effect = RuntimeError('missing object')
        with self.assertRaises(HTTPException): storage.finalize(24, 123, 'open-videos/stage/24/123/pending/' + 'a' * 32 + '.mp4')
        self.client.copy_object.assert_not_called()
