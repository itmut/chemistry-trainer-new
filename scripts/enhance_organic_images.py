"""Create crisp, readable organic structure cards from PubChem rasters.

The source images are often trimmed to only a few dozen pixels.  This helper
keeps the atom colours and geometry, removes the grey source canvas, gives
large structures a light stroke boost, and exports a supersampled PNG so the
browser does not have to enlarge a pixel-sized drawing.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "public" / "images" / "organic"
RAW_DIR = ROOT / "tmpimg" / "raw"
MANIFEST = ROOT / "data" / "organic_image_manifest.json"
SCALE = 4


def font(size: int, mono: bool = False):
    candidates = (
        ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf"]
        if mono
        else ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"]
    )
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def rgb_source(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGBA")
    rgba = np.asarray(image).astype(np.uint8)
    if np.any(rgba[..., 3] < 250):
        # Existing trimmed assets have transparency already.  Composite over
        # the same warm-white used by PubChem so every export has clean edges.
        alpha = rgba[..., 3:4].astype(np.float32) / 255.0
        rgb = rgba[..., :3].astype(np.float32) * alpha + 245.0 * (1.0 - alpha)
        return np.clip(rgb, 0, 255).astype(np.uint8)
    return rgba[..., :3]


def enhance(source: np.ndarray) -> Image.Image:
    # PubChem uses a #f5f5f5 canvas.  A distance mask also catches coloured
    # hetero-atoms and anti-aliased black bonds.
    corners = np.concatenate(
        [source[:8, :8].reshape(-1, 3), source[:8, -8:].reshape(-1, 3), source[-8:, :8].reshape(-1, 3), source[-8:, -8:].reshape(-1, 3)]
    )
    background = np.median(corners, axis=0)
    distance = np.max(np.abs(source.astype(np.int16) - background.astype(np.int16)), axis=2)
    mask = distance > 4
    if not np.any(mask):
        return Image.fromarray(source, "RGB")

    ys, xs = np.where(mask)
    pad = 8
    y0, y1 = max(0, ys.min() - pad), min(source.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(source.shape[1], xs.max() + pad + 1)
    crop = source[y0:y1, x0:x1]

    # A 3×3 minimum filter expands dark/coloured ink into the light canvas by
    # one source pixel.  Unlike mask dilation it keeps diagonal bonds smooth
    # and preserves the conventional red/green/blue atom colours.
    image = Image.fromarray(crop, "RGB").filter(ImageFilter.MinFilter(3))
    image = ImageOps.expand(image, border=8, fill=tuple(int(v) for v in background))
    image = image.resize((image.width * SCALE, image.height * SCALE), Image.Resampling.BICUBIC)
    return image


def save_polymer_assets() -> None:
    """Draw the repeat-unit cards that have no PubChem structure record."""

    polymer_cards = {
        181: ("α-D-ГЛЮКОЗА", "(C₆H₁₀O₅)ₙ"),
        182: ("β-D-ГЛЮКОЗА", "(C₆H₁₀O₅)ₙ"),
        187: ("–Si(CH₃)₂–O–", "[(CH₃)₂SiO]ₙ"),
        188: ("–CH₂–CHCl–", "[-CH₂-CHCl-]ₙ"),
        189: ("–CH₂–CH₂–", "[-CH₂-CH₂-]ₙ"),
        190: ("–CH₂–CH(CH₃)–", "[-CH₂-CH(CH₃)-]ₙ"),
        191: ("–CH₂–CH(C₆H₅)–", "[-CH₂-CH(C₆H₅)-]ₙ"),
        192: ("–CF₂–CF₂–", "[-CF₂-CF₂-]ₙ"),
        193: ("–CH₂–CH(OCOCH₃)–", "[-CH₂-CH(OCOCH₃)-]ₙ"),
        195: ("–NH–(CH₂)₆–NH–CO–(CH₂)₄–CO–", "[-NH-(CH₂)₆-NH-CO-(CH₂)₄-CO-]ₙ"),
        196: ("–O–CH₂CH₂–O–CO–C₆H₄–CO–", "[-O-CH₂-CH₂-O-CO-C₆H₄-CO-]ₙ"),
        197: ("–O–CH(CH₃)–CO–", "–O–CH(CH₃)–CO–ₙ"),
    }
    for number, (label, formula) in polymer_cards.items():
        canvas = Image.new("RGB", (1200, 420), (245, 245, 245))
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle((18, 18, 1182, 402), radius=28, outline=(210, 215, 205), width=3, fill=(250, 249, 243))
        f_formula = font(76, mono=True)
        f_label = font(30)
        bbox = draw.textbbox((0, 0), formula, font=f_formula)
        draw.text(((1200 - (bbox[2] - bbox[0])) / 2, 142), formula, font=f_formula, fill=(53, 73, 50))
        bbox = draw.textbbox((0, 0), label, font=f_label)
        draw.text(((1200 - (bbox[2] - bbox[0])) / 2, 72), label, font=f_label, fill=(112, 120, 108))
        canvas.resize((900, 315), Image.Resampling.LANCZOS).save(IMAGE_DIR / f"o{number:03d}.png", optimize=True)


def save_xylene() -> None:
    number = 50
    canvas = Image.new("RGB", (720, 520), (245, 245, 245))
    draw = ImageDraw.Draw(canvas)
    cx, cy, r = 360, 245, 130
    points = [(cx + r * np.cos(np.pi / 6 + i * np.pi / 3), cy + r * np.sin(np.pi / 6 + i * np.pi / 3)) for i in range(6)]
    points = [(int(x), int(y)) for x, y in points]
    draw.line(points + [points[0]], fill=(48, 53, 48), width=8, joint="curve")
    inner = [(int(cx + (r - 20) * np.cos(np.pi / 6 + i * np.pi / 3)), int(cy + (r - 20) * np.sin(np.pi / 6 + i * np.pi / 3))) for i in range(6)]
    for i in (0, 2, 4):
        draw.line([inner[i], inner[(i + 1) % 6]], fill=(48, 53, 48), width=6)
    f = font(45, mono=True)
    for p in (points[0], points[3]):
        vx, vy = p[0] - cx, p[1] - cy
        length = max((vx * vx + vy * vy) ** 0.5, 1)
        end = (int(p[0] + vx / length * 92), int(p[1] + vy / length * 92))
        draw.line([p, end], fill=(48, 53, 48), width=8)
        label_box = draw.textbbox((0, 0), "CH₃", font=f)
        label_w, label_h = label_box[2] - label_box[0], label_box[3] - label_box[1]
        label_x = end[0] + (15 if vx > 0 else -label_w - 15)
        label_y = end[1] + (8 if vy > 0 else -label_h - 8)
        draw.text((label_x, label_y), "CH₃", font=f, fill=(48, 53, 48))
    canvas.resize((600, 434), Image.Resampling.LANCZOS).save(IMAGE_DIR / f"o{number:03d}.png", optimize=True)


def main() -> None:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    for item in json.loads(MANIFEST.read_text()):
        number = int(item["id"])
        if number > 200:
            continue
        raw = RAW_DIR / f"o{number:03d}.png"
        current = IMAGE_DIR / f"o{number:03d}.png"
        # Raw downloads live outside the shipped project.  Never feed an
        # already enhanced output back into the pipeline on a later run.
        if raw.exists():
            enhance(rgb_source(raw)).save(current, optimize=True)
    save_xylene()
    save_polymer_assets()
    print("Enhanced organic structure assets")


if __name__ == "__main__":
    main()
