"""Use an explicitly migrated app data directory; never move data on import."""
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parent


def data_directory():
    configured = os.getenv('SHANGAN_GROWTH_DATA')
    if configured:
        return Path(configured)
    migrated = ROOT / '.growth-data'
    return migrated if migrated.is_dir() else Path.home() / '.shanganya-growth'


def prepare_temporary_directory():
    folder = ROOT / '.growth-tmp'
    folder.mkdir(exist_ok=True)
    os.environ['TEMP'] = os.environ['TMP'] = str(folder)
    tempfile.tempdir = str(folder)
