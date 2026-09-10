#!/usr/bin/env python3
"""
弹珠资产管线：把 AI 生成的弹珠图 → 抠图 → 缩放 → 加投影 → 输出游戏可用透明 PNG
用法：
  python3 scripts/process_marble_assets.py --input /path/to/raw_dir --output /path/to/out_dir
  python3 scripts/process_marble_assets.py --input raw.png --output out/
流程：
  1. rembg 抠图（白色背景 → 透明）
  2. 居中裁剪到弹珠包围盒 + 留边距
  3. LANCZOS 缩放到目标尺寸（默认 256px）
  4. 代码绘制投影（接触阴影，比 AI 生成的更可控）
  5. 输出 RGBA PNG + 元数据 JSON
依赖：rembg pillow numpy（pip install rembg pillow numpy onnxruntime -i 阿里云镜像）
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

try:
    from rembg import remove
except ImportError:
    print("需要 rembg: pip install rembg pillow numpy onnxruntime", file=sys.stderr)
    sys.exit(1)


def center_crop_to_alpha(img, pad_ratio=0.15):
    """按 alpha 包围盒居中裁剪 + 留边距"""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 128)
    if len(xs) == 0:
        return img  # 无内容，原样返回
    x0, x1 = xs.min(), xs.max()
    y0, y1 = ys.min(), ys.max()
    w = x1 - x0
    h = y1 - y0
    pad = int(max(w, h) * pad_ratio)
    # 方形裁剪（保证弹珠居中且不裁掉边缘光）
    side = max(w, h) + pad * 2
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    left = max(0, cx - side // 2)
    top = max(0, cy - side // 2)
    right = min(img.width, left + side)
    bottom = min(img.height, top + side)
    # 如果超出边界，反向扩展
    if right - left < side:
        left = max(0, right - side)
    if bottom - top < side:
        top = max(0, bottom - side)
    return img.crop((left, top, right, bottom))


def draw_shadow(marble_img, shadow_opacity=0.4, blur=8):
    """给弹珠加接触阴影（底部椭圆柔影），返回带阴影的 RGBA"""
    w, h = marble_img.size
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # 底部椭圆阴影
    from PIL import ImageDraw
    d = ImageDraw.Draw(shadow)
    sw, sh = int(w * 0.62), int(h * 0.16)
    sx, sy = w // 2, int(h * 0.92)
    d.ellipse((sx - sw // 2, sy - sh // 2, sx + sw // 2, sy + sh // 2), fill=(0, 0, 0, int(255 * shadow_opacity)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    # 合成：阴影在下，弹珠在上
    result = Image.alpha_composite(shadow, marble_img)
    return result


def process_single(input_path, output_path, size=256, with_shadow=True):
    """处理单张图，返回元数据"""
    img = Image.open(input_path).convert("RGBA")
    # 1. 抠图
    removed = remove(img)
    # 2. 居中裁剪
    cropped = center_crop_to_alpha(removed)
    # 3. 缩放
    side = cropped.width
    target = size
    # 弹珠占输出图的 ~80%，留边距给阴影
    marble_target = int(target * 0.8)
    scale = marble_target / side
    resized = cropped.resize((int(cropped.width * scale), int(cropped.height * scale)), Image.LANCZOS)
    # 居中到画布
    canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    ox = (target - resized.width) // 2
    oy = int((target - resized.height) * 0.42)  # 稍微上移，给底部阴影留空间
    canvas.paste(resized, (ox, oy), resized)
    # 4. 阴影
    if with_shadow:
        canvas = draw_shadow(canvas)
    canvas.save(output_path)
    return {
        "input": os.path.basename(input_path),
        "output": os.path.basename(output_path),
        "size": target,
        "with_shadow": with_shadow,
    }


def main():
    parser = argparse.ArgumentParser(description="弹珠资产管线")
    parser.add_argument("--input", required=True, help="输入图片或目录")
    parser.add_argument("--output", required=True, help="输出目录")
    parser.add_argument("--size", type=int, default=256, help="输出尺寸（默认 256）")
    parser.add_argument("--no-shadow", action="store_true", help="不加阴影")
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)

    if os.path.isdir(args.input):
        files = sorted(
            f for f in os.listdir(args.input)
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
        )
    else:
        files = [os.path.basename(args.input)]
        args.input = os.path.dirname(args.input)

    if not files:
        print("没有找到图片文件", file=sys.stderr)
        sys.exit(1)

    results = []
    for i, f in enumerate(files):
        in_path = os.path.join(args.input, f)
        stem = os.path.splitext(f)[0]
        out_name = f"marble_{i:03d}.png"
        out_path = os.path.join(args.output, out_name)
        print(f"处理 [{i+1}/{len(files)}] {f} → {out_name}")
        meta = process_single(in_path, out_path, args.size, not args.no_shadow)
        meta["style"] = stem.split("-")[-1]  # 简单样式名
        results.append(meta)

    # 元数据
    with open(os.path.join(args.output, "manifest.json"), "w", encoding="utf-8") as fp:
        json.dump(results, fp, ensure_ascii=False, indent=2)

    print(f"完成！{len(results)} 张 → {args.output}")
    print(f"manifest: {os.path.join(args.output, 'manifest.json')}")


if __name__ == "__main__":
    main()
