"""Rebuild PREPPY's static social sharing images with local system fonts."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
FONT = str(PUBLIC / "fonts" / "IBMPlexSansKR-SemiBold.ttf")
FONT_BOLD = FONT


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def make_image(height: int, filename: str) -> None:
    paper = "#F7F8F4"
    deep_green = "#244A40"
    green = "#315C50"
    ink = "#17251F"
    muted = "#51635A"
    image = Image.new("RGB", (1200, height), paper)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 15, height), fill=green)

    icon = Image.open(PUBLIC / "preppy-app-icon.png").convert("RGB")
    icon = icon.resize((62, 62), Image.Resampling.LANCZOS)
    image.paste(icon, (82, 70))
    draw.text((161, 76), "PREPPY", font=font(38, True), fill=deep_green)
    draw.text((1000, 88), "preppy.kr", font=font(23), fill=muted)

    draw.text((82, 203), "입학 준비에 필요한", font=font(63, True), fill=ink)
    draw.text((82, 288), "정보, 한곳에서", font=font(70, True), fill=deep_green)
    draw.rounded_rectangle((82, 396, 684, 460), radius=18, fill="#E6EEE8")
    draw.text((106, 408), "영어유치원 · 사립초등학교 · 국제학교", font=font(29, True), fill=deep_green)

    # The closing line is kept inside both the 630 px and 600 px variants.
    draw.text((83, height - 90), "공식 출처와 함께 살펴보세요", font=font(27), fill=muted)

    # Simple editorial cards echo the site's restrained green and paper styling.
    draw.rounded_rectangle((795, 170, 1120, height - 77), radius=24, fill="#D8E3DA")
    draw.rounded_rectangle((772, 150, 1098, height - 99), radius=24, fill="#FFFFFF")
    draw.rounded_rectangle((801, 181, 1069, 238), radius=14, fill=deep_green)
    draw.text((825, 190), "입학정보", font=font(28, True), fill="#FFFFFF")
    for index, label in enumerate(("모집 일정", "지원 조건", "공식 안내")):
        top = 267 + index * 88
        draw.ellipse((805, top + 12, 822, top + 29), fill="#78A68D")
        draw.text((840, top), label, font=font(28, True), fill=ink)
        if index < 2:
            draw.line((805, top + 59, 1067, top + 59), fill="#E4EBE5", width=2)

    image.save(PUBLIC / filename, optimize=True)


if __name__ == "__main__":
    make_image(630, "preppy-social-og.png")
    make_image(600, "preppy-social-x.png")
