"""Real RapidOCR/ONNX adapter. No filename/template fallback."""
import io
import threading

_engine = None
_lock = threading.Lock()


def recognize(raw, prefix='image:1'):
    global _engine
    import numpy as np
    from PIL import Image
    with Image.open(io.BytesIO(raw)) as image:
        if image.width * image.height > 25_000_000:
            raise ValueError('图片过大，请缩小至2500万像素以内')
        image = np.asarray(image.convert('RGB'))
    with _lock:
        if _engine is None:
            from rapidocr import RapidOCR
            _engine = RapidOCR()
        output = _engine(image)
    units = []
    for i, (text, score, box) in enumerate(zip(output.txts if output.txts is not None else [], output.scores if output.scores is not None else [], output.boxes if output.boxes is not None else []), 1):
        units.append({'locator':f'{prefix}/ocr:{i}', 'text':str(text),
                      'ocr_confidence':float(score), 'box':box.tolist(),
                      'needs_confirmation':float(score) < 0.85})
    if not units:
        raise ValueError('OCR未识别到文字；请补充清晰图像，未生成示例文字')
    return units


def parse_image(raw):
    units = recognize(raw)
    return result(units)


def parse_scanned_pdf(raw):
    import fitz
    units = []
    with fitz.open(stream=raw, filetype='pdf') as doc:
        if len(doc) > 12:
            raise ValueError('扫描PDF每次最多12页，请拆分后导入')
        for i, page in enumerate(doc, 1):
            units.extend(recognize(page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).tobytes('png'), f'page:{i}'))
    return result(units)


def result(units):
    return {'units':units, 'statistics':{'ocr_units':len(units),
            'low_confidence_units':sum(u['needs_confirmation'] for u in units)},
            'parser':'rapidocr-onnx', 'limitations':['OCR可能误识别；置信度低于0.85的文字须人工核对，不能据此自动通过复核。']}
