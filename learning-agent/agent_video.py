"""Render an honest caption-based walkthrough MP4; never fake a screen recording."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from learning_agent import DATA, route


def render(identifier):
    from PIL import Image, ImageDraw, ImageFont
    body = route(identifier)
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise ValueError('未找到 FFmpeg，仍可阅读步骤；安装 FFmpeg 后可生成字幕视频')
    fonts = [Path(os.environ.get('SHANGAN_AGENT_FONT', '/nonexistent')),
             Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts/msyh.ttc',
             Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'),
             Path('/usr/share/fonts/truetype/wqy/wqy-microhei.ttc')]
    font_path = next((p for p in fonts if p.is_file()), None)
    if font_path is None:
        raise ValueError('未找到中文字体，无法可靠生成中文字幕视频')
    font = ImageFont.truetype(str(font_path), 31)
    small = ImageFont.truetype(str(font_path), 23)
    title_font = ImageFont.truetype(str(font_path), 40)
    steps = body.get('tutorialSteps') or [
        {'title':a['title'],'instruction':a['instruction'],'check':a['check']}
        for t in body['tasks'] for a in (t.get('actions') or [
            {'title':t['title'],'instruction':t['firstStep'],'check':t['acceptance']}])]
    total_steps = len(steps)
    steps = steps[:8]
    target_dir = DATA / 'videos'
    target_dir.mkdir(exist_ok=True)
    name = body['id'] + '-v' + str(body['version']) + '.mp4'
    target = target_dir / name
    if target.exists():
        return {'url': '/api/agent/video/' + name, 'format': 'mp4', 'kind': 'caption-walkthrough', 'stepCount':len(steps),'totalSteps':total_steps}

    def wrapped(text, draw, current_font, width, max_lines):
        lines, current = [], ''
        for ch in str(text):
            if ch == '\n' or draw.textlength(current + ch, font=current_font) > width:
                lines.append(current)
                current = '' if ch == '\n' else ch
            else:
                current += ch
        if current:
            lines.append(current)
        if len(lines) > max_lines:
            lines = lines[:max_lines]
            lines[-1] = lines[-1][:-2] + '…'
        return lines

    with tempfile.TemporaryDirectory(prefix='duck-video-') as tmp:
        for i, step in enumerate(steps):
            img = Image.new('RGB', (1280, 720), '#f5f4ed')
            draw = ImageDraw.Draw(img)
            draw.rounded_rectangle((48, 40, 1232, 680), radius=28, fill='#ffffff')
            draw.text((88, 72), '上岸鸭  /  操作步骤讲解', font=small, fill='#126655')
            draw.text((1110, 72), f'{i+1}/{len(steps)}', font=small, fill='#126655')
            y = 132
            for line in wrapped(step['title'], draw, title_font, 1090, 2):
                draw.text((88, y), line, font=title_font, fill='#152b2b'); y += 51
            y += 23
            for line in wrapped(step['instruction'], draw, font, 1090, 6):
                draw.text((88, y), line, font=font, fill='#29413d'); y += 44
            draw.text((88, 555), '完成标志', font=small, fill='#126655')
            for j, line in enumerate(wrapped(step.get('check', ''), draw, small, 960, 2)):
                draw.text((245, 555 + j * 30), line, font=small, fill='#29413d')
            draw.text((88, 628), '字幕讲解 · 请在实际页面验证操作结果 · 非真实操作录像', font=small, fill='#73827a')
            img.save(Path(tmp) / f'{i:03d}.png')
        stage = Path(tmp) / 'output.mp4'
        command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1/7',
                   '-i', str(Path(tmp) / '%03d.png'), '-t', str(len(steps) * 7),
                   '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25', '-pix_fmt', 'yuv420p',
                   '-r', '24', '-movflags', '+faststart', str(stage)]
        try:
            subprocess.run(command, check=True, timeout=90, capture_output=True)
        except (subprocess.SubprocessError, OSError):
            raise ValueError('视频渲染失败，请检查 FFmpeg 是否包含 H.264 编码器')
        if not stage.is_file() or stage.stat().st_size < 1000:
            raise ValueError('未得到有效的视频文件')
        os.replace(stage, target)
    return {'url': '/api/agent/video/' + name, 'format': 'mp4', 'seconds': len(steps) * 7, 'kind': 'caption-walkthrough', 'stepCount':len(steps),'totalSteps':total_steps}
