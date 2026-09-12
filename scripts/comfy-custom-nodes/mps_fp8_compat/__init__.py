"""Work around Apple MPS missing Float8_e4m3fn / Float8_e5m2 casts.

comfy_kitchen's eager FP8 path does `x.to(output_dtype)` on the compute device.
MPS can allocate/store those dtypes (empty_like + copy) but cannot convert them,
so Wan / Flux `fp8_scaled` UNETs die in KSampler with:

    RuntimeError: Undefined type Float8_e4m3fn

Dequantize (and quantize) on CPU, then move the result back.
"""

from __future__ import annotations

import logging

import torch

log = logging.getLogger("mps_fp8_compat")

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

_FP8_DTYPES = tuple(
    dt
    for dt in (
        getattr(torch, "float8_e4m3fn", None),
        getattr(torch, "float8_e5m2", None),
    )
    if dt is not None
)


def _needs_cpu_roundtrip(*tensors: object) -> bool:
    for tensor in tensors:
        if not isinstance(tensor, torch.Tensor):
            continue
        if tensor.device.type == "mps" and tensor.dtype in _FP8_DTYPES:
            return True
    return False


def _cpu(tensor: torch.Tensor) -> torch.Tensor:
    return tensor if tensor.device.type == "cpu" else tensor.detach().to("cpu")


def _to_device(tensor: torch.Tensor, device: torch.device) -> torch.Tensor:
    if tensor.device == device:
        return tensor
    if device.type == "mps" and tensor.dtype in _FP8_DTYPES:
        # `.to("mps")` raises on float8; move the raw bytes as uint8.
        return tensor.view(torch.uint8).to(device).view(tensor.dtype)
    return tensor.to(device)


def _patch_eager_fp8() -> None:
    from comfy_kitchen.backends.eager import quantization as eager_quant

    orig_dequant = eager_quant.dequantize_per_tensor_fp8
    orig_quant = eager_quant.quantize_per_tensor_fp8

    def dequantize_per_tensor_fp8(x, scale, output_type=torch.bfloat16):
        if not _needs_cpu_roundtrip(x, scale):
            return orig_dequant(x, scale, output_type)
        device = x.device
        dq = orig_dequant(
            _cpu(x),
            _cpu(scale) if isinstance(scale, torch.Tensor) else scale,
            output_type,
        )
        return _to_device(dq, device)

    def quantize_per_tensor_fp8(x, scale, output_type=torch.float8_e4m3fn):
        if x.device.type != "mps":
            return orig_quant(x, scale, output_type)
        device = x.device
        q = orig_quant(
            _cpu(x),
            _cpu(scale) if isinstance(scale, torch.Tensor) else scale,
            output_type,
        )
        return _to_device(q, device)

    eager_quant.dequantize_per_tensor_fp8 = dequantize_per_tensor_fp8
    eager_quant.quantize_per_tensor_fp8 = quantize_per_tensor_fp8
    log.info("Patched comfy_kitchen eager FP8 quant/dequant for MPS")


try:
    _patch_eager_fp8()
except Exception as exc:  # noqa: BLE001 — never block ComfyUI startup
    log.warning("Could not patch comfy_kitchen FP8 for MPS: %s", exc)
