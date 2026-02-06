#!/usr/bin/env python3
import os
from PIL import Image, ImageDraw, ImageFont

# Create assets directory if it doesn't exist
assets_dir = "../assets"
if not os.path.exists(assets_dir):
    os.makedirs(assets_dir)

# Icon sizes needed
sizes = [16, 32, 48, 128]

# TWIST brand color (purple)
brand_color = (139, 92, 246)  # #8B5CF6
background_color = (255, 255, 255)  # White background

for size in sizes:
    # Create a new image with white background
    img = Image.new('RGBA', (size, size), background_color)
    draw = ImageDraw.Draw(img)
    
    # Draw a purple circle
    margin = size // 8
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=brand_color
    )
    
    # Draw "T" in the center
    try:
        # Try to use a system font, fallback to default if not available
        font_size = size // 2
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except:
            # Use default font if Helvetica is not available
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()
    
    # Get text bounds
    text = "T"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Calculate position to center the text
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - bbox[1]
    
    # Draw the text
    draw.text((x, y), text, fill=(255, 255, 255), font=font)
    
    # Save the image
    filename = f"{assets_dir}/icon-{size}.png"
    img.save(filename, 'PNG')
    print(f"Created {filename}")

# Also create logo.svg placeholder
svg_content = '''<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <circle cx="64" cy="64" r="56" fill="#8B5CF6"/>
  <text x="64" y="80" font-family="Arial, sans-serif" font-size="56" font-weight="bold" text-anchor="middle" fill="white">T</text>
</svg>'''

with open(f"{assets_dir}/logo.svg", "w") as f:
    f.write(svg_content)
    print(f"Created {assets_dir}/logo.svg")