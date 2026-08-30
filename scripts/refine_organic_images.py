from __future__ import annotations

from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / 'public' / 'images' / 'organic'


def refine(path: Path) -> None:
    image = Image.open(path).convert('RGBA')
    rgba = np.asarray(image).astype(np.uint8)
    rgb = rgba[..., :3].astype(np.float32)

    # Estimate the plain canvas colour from the corners.
    corners = np.concatenate([
        rgb[:8, :8].reshape(-1, 3),
        rgb[:8, -8:].reshape(-1, 3),
        rgb[-8:, :8].reshape(-1, 3),
        rgb[-8:, -8:].reshape(-1, 3),
    ])
    background = np.median(corners, axis=0)
    diff = rgb - background
    distance = np.sqrt((diff ** 2).sum(axis=2))

    # Soft alpha keeps anti-aliased bond edges clean while removing the
    # opaque light-grey box around the structure.
    alpha = np.clip((distance - 4.0) / 24.0, 0.0, 1.0)
    if not np.any(alpha > 0.05):
        return

    ys, xs = np.where(alpha > 0.05)
    pad = 10
    y0, y1 = max(0, ys.min() - pad), min(image.height, ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(image.width, xs.max() + pad + 1)

    crop_rgb = rgb[y0:y1, x0:x1]
    crop_alpha = alpha[y0:y1, x0:x1]
    out = np.dstack([crop_rgb, crop_alpha * 255.0]).astype(np.uint8)
    refined = Image.fromarray(out, 'RGBA')

    # Upscale undersized sources so the browser is not forced to enlarge them.
    scale = min(4.0, max(1.0, min(1400 / refined.width, 900 / refined.height)))
    new_size = (max(1, round(refined.width * scale)), max(1, round(refined.height * scale)))
    if new_size != refined.size:
        refined = refined.resize(new_size, Image.Resampling.LANCZOS)

    # A light unsharp mask improves line readability without over-thickening
    # triple bonds and aromatic rings.
    refined = refined.filter(ImageFilter.UnsharpMask(radius=1.25, percent=135, threshold=2))

    # Add transparent breathing room so structures never touch the stage edge.
    canvas = Image.new('RGBA', (refined.width + 40, refined.height + 40), (255, 255, 255, 0))
    canvas.alpha_composite(refined, (20, 20))
    canvas.save(path)


if __name__ == '__main__':
    paths = sorted(IMAGE_DIR.glob('*.png'))
    for index, image_path in enumerate(paths, 1):
        refine(image_path)
        if index % 25 == 0:
            print(f'{index}/{len(paths)}')
    print(f'Refined {len(paths)} organic structure images')
