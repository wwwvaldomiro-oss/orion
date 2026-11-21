export type CameraEnvironmentInfo = {
  isSecureContext: boolean;
  isInIframe: boolean;
  hasMediaDevices: boolean;
  permissionState: "granted" | "denied" | "prompt" | "unknown";
  iframeCameraBlocked: boolean;
};

export type CameraErrorClassification = {
  code:
    | "insecure_context"
    | "unsupported_browser"
    | "iframe_blocked"
    | "permission_denied"
    | "no_camera"
    | "camera_in_use"
    | "overconstrained"
    | "unknown";
  title: string;
  message: string;
  shouldRetryWithFallback: boolean;
  blockedByPermission: boolean;
};

export async function inspectCameraEnvironment(): Promise<CameraEnvironmentInfo> {
  const isSecureContext = typeof window !== "undefined" ? Boolean(window.isSecureContext) : false;
  let isInIframe = false;
  try {
    isInIframe = typeof window !== "undefined" && window.self !== window.top;
  } catch {
    isInIframe = true;
  }

  const hasMediaDevices =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");

  let permissionState: CameraEnvironmentInfo["permissionState"] = "unknown";
  try {
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      const status = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });
      if (status.state === "granted" || status.state === "denied" || status.state === "prompt") {
        permissionState = status.state;
      }
    }
  } catch {
    permissionState = "unknown";
  }

  let iframeCameraBlocked = false;
  try {
    const docAny = document as unknown as {
      permissionsPolicy?: { allowsFeature?: (f: string) => boolean };
      featurePolicy?: { allowsFeature?: (f: string) => boolean };
    };
    const policy = docAny.permissionsPolicy ?? docAny.featurePolicy;
    if (policy?.allowsFeature && !policy.allowsFeature("camera")) {
      iframeCameraBlocked = true;
    }
  } catch {
    // Ignore unsupported permissionsPolicy introspection
  }

  return {
    isSecureContext,
    isInIframe,
    hasMediaDevices,
    permissionState,
    iframeCameraBlocked,
  };
}

export function classifyCameraError(
  err: unknown,
  env: Partial<CameraEnvironmentInfo> = {},
): CameraErrorClassification {
  if (env.isSecureContext === false) {
    return {
      code: "insecure_context",
      title: "Contexto não seguro (HTTPS obrigatório)",
      message:
        "A câmera ao vivo exige conexão HTTPS segura. Use as opções abaixo (foto da câmera do aparelho, galeria, PDF, XML ou chave).",
      shouldRetryWithFallback: false,
      blockedByPermission: true,
    };
  }

  if (env.iframeCameraBlocked) {
    return {
      code: "iframe_blocked",
      title: "Prévia bloqueou a câmera ao vivo",
      message:
        "O ambiente embutido (iframe) bloqueou a permissão de câmera ao vivo. Abra o aplicativo em janela independente HTTPS ou use 'Tirar foto da nota' abaixo.",
      shouldRetryWithFallback: false,
      blockedByPermission: true,
    };
  }

  const name =
    err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  const rawMessage = err instanceof Error ? err.message : String(err ?? "");

  if (name === "NotAllowedError" || name === "PermissionDeniedError" || /denied|permission/i.test(rawMessage)) {
    if (env.isInIframe) {
      return {
        code: "iframe_blocked",
        title: "Acesso à câmera bloqueado na prévia ou no navegador",
        message:
          "A prévia do Google AI Studio ou o Chrome no Android negou o acesso ao vídeo ao vivo. Você pode abrir o Órion em janela HTTPS independente ou fotografar a nota diretamente abaixo.",
        shouldRetryWithFallback: false,
        blockedByPermission: true,
      };
    }
    return {
      code: "permission_denied",
      title: "Permissão de câmera negada",
      message:
        "Libere o acesso à câmera nas configurações do navegador/Android para usar o leitor ao vivo, ou utilize 'Tirar foto da nota' abaixo.",
      shouldRetryWithFallback: false,
      blockedByPermission: true,
    };
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      code: "no_camera",
      title: "Nenhuma câmera encontrada",
      message:
        "Não encontramos câmera disponível neste dispositivo. Importe uma imagem, PDF, XML ou informe a chave de acesso.",
      shouldRetryWithFallback: false,
      blockedByPermission: false,
    };
  }

  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return {
      code: "overconstrained",
      title: "Ajustando câmera alternativa",
      message: "A câmera traseira preferencial não respondeu; tentando outra câmera disponível.",
      shouldRetryWithFallback: true,
      blockedByPermission: false,
    };
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      code: "camera_in_use",
      title: "Câmera ocupada por outro aplicativo",
      message: "Feche outros aplicativos que estejam usando a câmera e tente novamente, ou importe uma foto.",
      shouldRetryWithFallback: true,
      blockedByPermission: false,
    };
  }

  if (name === "SecurityError") {
    return {
      code: "insecure_context",
      title: "Acesso bloqueado por segurança",
      message: "O navegador bloqueou a câmera neste contexto. Utilize uma janela HTTPS independente ou tire foto da nota.",
      shouldRetryWithFallback: false,
      blockedByPermission: true,
    };
  }

  return {
    code: "unknown",
    title: "Câmera ao vivo indisponível",
    message: rawMessage || "Não foi possível abrir a câmera. Utilize foto, galeria, PDF, XML ou chave manual.",
    shouldRetryWithFallback: false,
    blockedByPermission: false,
  };
}
