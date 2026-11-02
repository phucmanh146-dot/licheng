"""Private S3-compatible content-addressed blobs. Never generates public URLs."""
import hashlib
import os
from functools import lru_cache


@lru_cache
def client():
    import boto3
    from botocore.config import Config
    return boto3.client('s3', endpoint_url=os.getenv('SHANGAN_S3_ENDPOINT') or None,
                        region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1'),
                        config=Config(connect_timeout=5, read_timeout=20, retries={'max_attempts':2}))


def put(project_id, raw):
    bucket = os.getenv('SHANGAN_S3_BUCKET')
    if not bucket:
        return None
    digest = hashlib.sha256(raw).hexdigest()
    key = 'artifacts/'+project_id+'/'+digest
    # Private bucket is provisioned separately. Do not set a public object ACL.
    client().put_object(Bucket=bucket, Key=key, Body=raw, ContentType='application/octet-stream')
    return key


def get(key, expected):
    response = client().get_object(Bucket=os.environ['SHANGAN_S3_BUCKET'], Key=key)
    try:
        raw = response['Body'].read(2_000_001)
    finally:
        response['Body'].close()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError('对象存储内容校验失败')
    return raw
