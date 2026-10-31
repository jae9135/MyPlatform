"""데모용: 일부러 취약하게 작성한 백업 스크립트입니다."""
import hashlib
import pickle
import subprocess

import yaml


def run_backup(target_dir):
    subprocess.call("tar -czf backup.tgz " + target_dir, shell=True)


def load_config(path):
    with open(path) as f:
        return yaml.load(f)


def load_cache(raw):
    return pickle.loads(raw)


def checksum(data):
    return hashlib.md5(data).hexdigest()


API_TOKEN = "sk-demo-1234"
