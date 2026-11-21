import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, BrowserQRCodeReader } from "@zxing/browser";
import {
  AlertTriangle,
  Camera,
  ExternalLink,
  FileCode2,
  FileText,
  Flashlight,
  ImagePlus,
  KeyRound,
  Link2,
  RefreshCw,
  ScanLine,
  SwitchCamera,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  classifyCameraError,
  inspectCameraEnvironment,
  type CameraErrorClassification,
} from "@/lib/cameraSupport";
import { parseFiscalInput } from "@/lib/fiscalDocuments";

export type QrScanResultPayload = {
  rawValue: string;
  sourceUrl: string;
  accessKey: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onQrDecoded: (payload: QrScanResultPayload) => void;
  onFileSelected: (file: File, detectedQrText?: string) => void;
  onManualKeyOrUrl: (rawValue: string) => void;
};

async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const reader = new BrowserQRCodeReader();
    try {
      const result = await reader.decodeFromImageUrl(objectUrl);
      const txt = result.getText()?.trim();
      if (txt) return txt;
    } catch {
      // Fallback: draw scaled down to canvas for high-res phone photos
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Falha ao carregar imagem"));
        el.src = objectUrl;
      });
      const maxDim = 1400;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          const canvasResult = reader.decodeFromCanvas(canvas);
          const txt = canvasResult.getText()?.trim();
          if (txt) return txt;
        } catch {
          return null;
        }
      }
    }
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function FiscalQrScannerModal({
  open,
  onClose,
  onQrDecoded,
  onFileSelected,
  onManualKeyOrUrl,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const permissionDeniedRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorClassification | null>(null);
  const [isInIframe, setIsInIframe] = useState(false);

  const [manualText, setManualText] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  const stopCamera = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // Ignore ZXing cleanup race
    }
    controlsRef.current = null;

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore track stop failure
        }
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(
    async (preferredDeviceId?: string) => {
      if (permissionDeniedRef.current) {
        return;
      }

      setStarting(true);
      setCameraError(null);
      stopCamera();

      const env = await inspectCameraEnvironment();
      setIsInIframe(env.isInIframe);

      if (!env.isSecureContext) {
        setCameraError(classifyCameraError(new Error("Insecure context"), env));
        setStarting(false);
        return;
      }

      if (env.iframeCameraBlocked || env.permissionState === "denied") {
        permissionDeniedRef.current = true;
        setCameraError(
          classifyCameraError(
            Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }),
            env,
          ),
        );
        setStarting(false);
        return;
      }

      if (!env.hasMediaDevices) {
        setCameraError({
          code: "unsupported_browser",
          title: "Navegador sem suporte a vídeo ao vivo",
          message:
            "Este navegador não disponibilizou API de câmera ao vivo. Use 'Tirar foto da nota' ou importe a imagem.",
          shouldRetryWithFallback: false,
          blockedByPermission: false,
        });
        setStarting(false);
        return;
      }

      let stream: MediaStream | null = null;
      try {
        const videoConstraints: MediaTrackConstraints = preferredDeviceId
          ? { deviceId: { exact: preferredDeviceId } }
          : { facingMode: { ideal: "environment" } };
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints,
        });
      } catch (err) {
        const classified = classifyCameraError(err, env);
        if (classified.shouldRetryWithFallback) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          } catch (fallbackErr) {
            const fbClass = classifyCameraError(fallbackErr, env);
            if (fbClass.blockedByPermission) permissionDeniedRef.current = true;
            setCameraError(fbClass);
            setStarting(false);
            return;
          }
        } else {
          if (classified.blockedByPermission) permissionDeniedRef.current = true;
          setCameraError(classified);
          setStarting(false);
          return;
        }
      }

      if (!stream || !videoRef.current) {
        stream?.getTracks().forEach((t) => t.stop());
        setStarting(false);
        return;
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {
        // Autoplay attribute playsInline handles most browsers
      }

      // Inspect torch capability & available cameras after permission grant
      const activeTrack = stream.getVideoTracks()[0];
      if (activeTrack && typeof activeTrack.getCapabilities === "function") {
        const caps = activeTrack.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(Boolean(caps.torch));
      }

      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
        setDevices(videoInputs);
      } catch {
        // Ignore device enumeration errors
      }

      const reader = new BrowserMultiFormatReader();
      try {
        const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
          if (result) {
            const rawValue = result.getText().trim();
            if (!rawValue) return;
            const parsed = parseFiscalInput(rawValue);
            stopCamera();
            onQrDecoded({
              rawValue,
              sourceUrl: parsed.sourceUrl,
              accessKey: parsed.accessKey,
            });
          }
        });
        controlsRef.current = controls;
        setCameraActive(true);
      } catch (err) {
        const classified = classifyCameraError(err, env);
        setCameraError(classified);
        stopCamera();
      } finally {
        setStarting(false);
      }
    },
    [onQrDecoded, stopCamera],
  );

  // Start camera only when user explicitly opens the scanner modal
  useEffect(() => {
    if (!open) {
      stopCamera();
      permissionDeniedRef.current = false;
      setCameraError(null);
      return;
    }
    void startCamera();
    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  async function handleSwitchCamera() {
    if (devices.length < 2) return;
    const nextIdx = (deviceIndex + 1) % devices.length;
    setDeviceIndex(nextIdx);
    permissionDeniedRef.current = false;
    await startCamera(devices[nextIdx]?.deviceId);
  }

  async function handleToggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      toast.error("Lanterna não suportada por esta câmera.");
    }
  }

  async function handleImageOrPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const qrText = await decodeQrFromImageFile(file);
      stopCamera();
      if (qrText) {
        toast.success("QR Code identificado na imagem!");
      } else {
        toast.message("Imagem anexada. Se não houver QR legível, use OCR ou PDF.");
      }
      onFileSelected(file, qrText ?? undefined);
    } finally {
      setPhotoBusy(false);
    }
  }

  function handlePdfOrXmlPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    stopCamera();
    onFileSelected(file);
  }

  function handleSubmitManual() {
    const trimmed = manualText.trim();
    if (!trimmed) {
      toast.error("Informe a chave de 44 dígitos ou cole a URL da consulta fiscal.");
      return;
    }
    stopCamera();
    onManualKeyOrUrl(trimmed);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Leitor de QR Code e importação fiscal"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0c1928]/75 p-3 pb-20 md:p-4"
    >
      <section className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#dce2e6] bg-white p-4 shadow-2xl sm:p-5">
        <div className="mb-3 flex items-center justify-between border-b border-[#edf1f3] pb-3">
          <div className="flex items-center gap-2">
            <Camera className="size-5 text-[#173d4a]" />
            <h2 className="text-base font-bold text-[#0c1928]">Leitor QR Code & Captura Fiscal</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label="Fechar leitor"
            className="grid size-8 place-items-center rounded-lg border border-[#dce2e6] text-[#52616a] hover:bg-[#f0f3f5]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Live camera viewport */}
        <div className="relative overflow-hidden rounded-xl border border-[#dce2e6] bg-[#0c1928]">
          <video
            ref={videoRef}
            className={`aspect-[4/3] w-full object-cover ${cameraError ? "hidden" : "block"}`}
            muted
            playsInline
          />

          {/* Centered QR framing guide */}
          {cameraActive && !cameraError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative size-48 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(12,25,40,0.45)] sm:size-56">
                <span className="absolute -top-0.5 -left-0.5 size-5 rounded-tl-xl border-t-4 border-l-4 border-[#b99555]" />
                <span className="absolute -top-0.5 -right-0.5 size-5 rounded-tr-xl border-t-4 border-r-4 border-[#b99555]" />
                <span className="absolute -bottom-0.5 -left-0.5 size-5 rounded-bl-xl border-b-4 border-l-4 border-[#b99555]" />
                <span className="absolute -right-0.5 -bottom-0.5 size-5 rounded-br-xl border-r-4 border-b-4 border-[#b99555]" />
              </div>
            </div>
          )}

          {starting && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0c1928]/80 text-xs text-white">
              <RefreshCw className="size-5 animate-spin" />
              <span>Inicializando câmera traseira...</span>
            </div>
          )}

          {/* Camera controls bar */}
          {cameraActive && !cameraError && (
            <div className="flex items-center justify-between gap-2 bg-[#0c1928]/90 px-3 py-2 text-xs text-white">
              <span>Enquadre o QR Code na moldura</span>
              <div className="flex items-center gap-2">
                {torchSupported && (
                  <button
                    type="button"
                    onClick={() => void handleToggleTorch()}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold ${
                      torchOn ? "bg-[#b99555] text-[#0c1928]" : "bg-white/15 text-white"
                    }`}
                  >
                    <Flashlight className="size-3.5" />
                    Lanterna
                  </button>
                )}
                {devices.length > 1 && (
                  <button
                    type="button"
                    onClick={() => void handleSwitchCamera()}
                    className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1.5 font-semibold text-white"
                  >
                    <SwitchCamera className="size-3.5" />
                    Trocar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Clear non-blocking error banner when camera is unavailable */}
          {cameraError && (
            <div className="bg-[#fef2f2] p-4 text-xs text-[#991b1b]">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#dc2626]" />
                <div className="space-y-2">
                  <div className="font-bold text-[#7f1d1d]">{cameraError.title}</div>
                  <p className="leading-relaxed text-[#991b1b]">{cameraError.message}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!cameraError.blockedByPermission && (
                      <button
                        type="button"
                        onClick={() => {
                          permissionDeniedRef.current = false;
                          void startCamera();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 py-1.5 font-semibold text-white"
                      >
                        <RefreshCw className="size-3.5" /> Tentar novamente
                      </button>
                    )}
                    {isInIframe && typeof window !== "undefined" && (
                      <a
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbd3d8] bg-white px-3 py-1.5 font-semibold text-[#0c1928]"
                      >
                        <ExternalLink className="size-3.5" /> Abrir página HTTPS independente
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mandatory fallback capture & import alternatives */}
        <div className="mt-4 space-y-3">
          <div className="text-xs font-semibold text-[#0c1928]">
            Alternativas imediatas (funcionam mesmo com câmera ao vivo bloqueada)
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#173d4a]/30 bg-[#f2f6f7] px-3 py-2.5 text-xs font-semibold text-[#173d4a] hover:bg-[#e5eef0]">
              <Camera className="size-4 shrink-0" />
              <span>{photoBusy ? "Analisando foto..." : "Tirar foto da nota (câmera)"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={photoBusy}
                onChange={(e) => void handleImageOrPhotoPicked(e)}
                className="hidden"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#dce2e6] bg-white px-3 py-2.5 text-xs font-semibold text-[#0c1928] hover:bg-[#f7f8fa]">
              <ImagePlus className="size-4 shrink-0 text-[#173d4a]" />
              <span>Importar imagem da galeria</span>
              <input
                type="file"
                accept="image/*"
                disabled={photoBusy}
                onChange={(e) => void handleImageOrPhotoPicked(e)}
                className="hidden"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#dce2e6] bg-white px-3 py-2.5 text-xs font-semibold text-[#0c1928] hover:bg-[#f7f8fa]">
              <FileText className="size-4 shrink-0 text-[#173d4a]" />
              <span>Enviar arquivo PDF</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handlePdfOrXmlPicked}
                className="hidden"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#dce2e6] bg-white px-3 py-2.5 text-xs font-semibold text-[#0c1928] hover:bg-[#f7f8fa]">
              <FileCode2 className="size-4 shrink-0 text-[#173d4a]" />
              <span>Importar XML fiscal (NF-e / NFC-e)</span>
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                onChange={handlePdfOrXmlPicked}
                className="hidden"
              />
            </label>
          </div>

          {/* Manual URL or 44-digit access key */}
          <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#0c1928]">
              <KeyRound className="size-3.5 text-[#173d4a]" />
              <span>Ou cole a URL da consulta / digite a chave de 44 dígitos</span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="https://... ou 44 dígitos da NFC-e / NF-e"
                className="min-w-0 flex-1 rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleSubmitManual}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#173d4a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c1928]"
              >
                <ScanLine className="size-4" />
                Identificar
              </button>
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[#52616a]">
              <Link2 className="size-3 shrink-0" />
              Portais estaduais podem exigir consulta manual por CAPTCHA; se houver bloqueio, anexar XML, PDF ou foto preserva os dados reais.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
