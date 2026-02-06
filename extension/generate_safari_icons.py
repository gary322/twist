#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

# Create directories
safari_dir = 'safari/Shared/Resources/images'
os.makedirs(safari_dir, exist_ok=True)

# Icon sizes needed for Safari
sizes = [16, 19, 32, 38, 48, 72, 96, 128, 256, 512]

for size in sizes:
    img = Image.new('RGB', (size, size), color='#9333ea')
    draw = ImageDraw.Draw(img)
    
    # Draw a simple T logo
    font_size = int(size * 0.6)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        font = ImageFont.load_default()
    
    # Get text bounds
    text = "T"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Center the text
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - int(size * 0.05)
    
    # Draw the text
    draw.text((x, y), text, fill='white', font=font)
    
    # Save the icon
    if size in [16, 19, 32, 38, 48, 72]:
        img.save(f'{safari_dir}/toolbar-icon-{size}.png')
        print(f"✅ Created toolbar-icon-{size}.png")
    else:
        img.save(f'{safari_dir}/icon-{size}.png')
        print(f"✅ Created icon-{size}.png")

print("\n✅ All Safari icons created!")