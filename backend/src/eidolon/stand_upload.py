"""Uploading the stands to the bucket browsers download them from: `eidolon stand upload`.

What goes up is what the outfit lists in the build directory name (`stand_outfits`):
each outfit's `data.json`, `data.atlas` and `data.png`, as they were fetched (a
texture in WebP under its `.png` name goes up as WebP), under
`spine/idols/<category>/<enzaId>/`; its thumbnail under
`thumbnails/<category>/<enzaId>.png`, if it has been rendered; and the lists under
`outfits/<idol_id>.json`. The lists go up last, so that a browser never reads one that
names an outfit the bucket does not have yet. A thumbnail that failed to render is not
held back for: the list still names it, and the picker shows the card without it until
a later sync renders and uploads it.

An object the bucket already has as it is (its ETag is the file's MD5) is not uploaded
again, so a sync with nothing new only lists the bucket. An outfit's files never change,
so they are cached for good; a thumbnail may be rendered again, so it is cached for a
day; a list changes as cards come out, so it is checked every time.
"""

import asyncio
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

from eidolon.s3 import Bucket
from eidolon.stand_outfits import (
    LISTS_DIR,
    OUTFIT_FILES,
    is_webp,
    outfit_directory,
    outfit_path,
    source_directory,
    thumbnail_path,
)

OUTFIT_CACHE = "public, max-age=31536000, immutable"
THUMBNAIL_CACHE = "public, max-age=86400"
LIST_CACHE = "no-cache"
_CONTENT_TYPES = {
    ".json": "application/json",
    ".atlas": "text/plain; charset=utf-8",
    ".png": "image/png",
}
_CONCURRENT_UPLOADS = 8


@dataclass(frozen=True)
class _Upload:
    key: str
    path: Path
    cache_control: str


def _content_type(path: Path, body: bytes) -> str:
    if is_webp(body):
        return "image/webp"
    return _CONTENT_TYPES[path.suffix]


@dataclass
class UploadReport:
    uploaded: int = 0
    uploaded_bytes: int = 0
    unchanged: int = 0
    missing_thumbnails: list[str] = field(default_factory=list)
    """Outfits whose thumbnails have not been rendered, so were not uploaded."""


async def upload_stands(build: Path, bucket: Bucket) -> UploadReport:
    """Upload what the outfit lists in `build` name, from `build`, to `bucket`. Raises
    S3Error if the bucket fails, having uploaded what it could before; running it again
    picks up from there."""
    lists = sorted((build / LISTS_DIR).glob("*.json"))
    if not lists:
        raise RuntimeError(f"整理目录 {build / LISTS_DIR} 里没有衣装清单，先运行 eidolon stand outfits")
    report = UploadReport()
    source = source_directory(build)
    outfits = sorted({outfit for path in lists for outfit in _outfits_listed(path)})
    files = []
    for outfit in outfits:
        files += [
            _Upload(f"{outfit_path(outfit)}{name}", outfit_directory(source, outfit) / name, OUTFIT_CACHE)
            for name in OUTFIT_FILES
        ]
        thumbnail = build / thumbnail_path(outfit)
        if thumbnail.is_file():
            files.append(_Upload(thumbnail_path(outfit), thumbnail, THUMBNAIL_CACHE))
        else:
            report.missing_thumbnails.append(outfit)

    etags = await bucket.etags()
    await _upload_all(bucket, files, etags, report)
    await _upload_all(
        bucket, [_Upload(f"{LISTS_DIR}/{path.name}", path, LIST_CACHE) for path in lists], etags, report
    )
    return report


def _outfits_listed(path: Path) -> list[str]:
    try:
        cards = json.loads(path.read_text(encoding="utf-8"))["cards"]
        return [card[kind]["id"] for card in cards for kind in ("everyday", "stage") if card[kind]]
    except (json.JSONDecodeError, UnicodeDecodeError, KeyError, TypeError) as e:
        raise RuntimeError(f"衣装清单 {path} 格式有误（{e!r}），重新运行 eidolon stand outfits") from None


async def _upload_all(bucket: Bucket, files: list[_Upload], etags: dict[str, str], report: UploadReport) -> None:
    slots = asyncio.Semaphore(_CONCURRENT_UPLOADS)

    async def upload(file: _Upload) -> None:
        async with slots:  # also so that only a few files are read into memory at once
            body = file.path.read_bytes()
            if etags.get(file.key) == hashlib.md5(body).hexdigest():
                report.unchanged += 1
                return
            await bucket.put(file.key, body, _content_type(file.path, body), file.cache_control)
        report.uploaded += 1
        report.uploaded_bytes += len(body)

    try:
        async with asyncio.TaskGroup() as uploads:  # one failing stops the rest
            for file in files:
                uploads.create_task(upload(file))
    except ExceptionGroup as failed:
        raise failed.exceptions[0] from None
