"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Box, Alert, Typography } from "@mui/material";

type ScannerStatus = "starting" | "scanning" | "found" | "error";

export default function BarcodeScanner({
  onDecode,
  onError,
}: {
  onDecode: (isbn: string) => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<ScannerStatus>("starting");

  useEffect(() => {
    // zxing's MultiFormatReader tries every barcode format on every video
    // frame and console.warns internally whenever a format other than the
    // one actually in view throws a non-ReaderException (e.g. a
    // ChecksumException from MaxiCode/PDF417/Aztec decoders) — there's no
    // public option to silence it, and it fires continuously while
    // scanning normally, so filter just that one message while this
    // component is mounted rather than drowning the console in it.
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].startsWith("MultiFormatReader: non-ReaderException")) return;
      originalWarn(...args);
    };

    const reader = new BrowserMultiFormatReader();
    const video = videoRef.current!;
    let controls: { stop: () => void } | undefined;
  let stream: MediaStream | null = null;
    let disposed = false;

    const stopCamera = () => {
      controls?.stop();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        if (video.srcObject === stream) video.srcObject = null;
      }
    };

    async function startScanner() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (disposed) {
          stopCamera();
          return;
        }

        video.srcObject = stream;
        await video.play();
        const scannerControls = await reader.decodeFromVideoElement(video, (result) => {
          if (result && !disposed) {
            setStatus("found");
            stopCamera();
            onDecode(result.getText());
          }
          // NotFoundException fires continuously while no barcode is in frame; ignore it.
        });

        if (disposed) {
          scannerControls.stop();
          return;
        }
        controls = scannerControls;
        setStatus("scanning");
      } catch {
        if (disposed) return;
        setStatus("error");
        onError("Camera access failed. Check permissions or use manual entry below.");
      }
    }

    void startScanner();

    return () => {
      disposed = true;
      stopCamera();
      console.warn = originalWarn;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box>
      <Box sx={{ position: "relative", overflow: "hidden", borderRadius: 2 }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ display: "block", width: "100%", borderRadius: 8 }}
        />
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "78%",
            aspectRatio: "2.4 / 1",
            transform: "translate(-50%, -50%)",
            border: "2px solid rgba(255, 255, 255, 0.9)",
            borderRadius: 1,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.8), 0 0 10px rgba(0, 0, 0, 0.45)",
            pointerEvents: "none",
            zIndex: 1,
            "&::before, &::after": {
              content: '""',
              position: "absolute",
              top: "50%",
              left: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              transform: "translate(-50%, -50%)",
            },
            "&::before": { width: "30px", height: "2px" },
            "&::after": { width: "2px", height: "30px" },
          }}
        />
        <Box
          role="status"
          sx={{
            position: "absolute",
            left: 12,
            right: 12,
            top: 12,
            px: 1.5,
            py: 1,
            borderRadius: 1,
            color: "common.white",
            backgroundColor: "rgba(0, 0, 0, 0.72)",
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.35)",
            textAlign: "center",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <Typography variant="body2">
            {status === "starting" && "Starting camera..."}
            {status === "scanning" && "Scanning for a book barcode"}
            {status === "found" && "Barcode found"}
            {status === "error" && "Camera unavailable"}
          </Typography>
        </Box>
      </Box>
      <Alert severity="info" sx={{ mt: 2 }}>
        Point the camera at the book&apos;s barcode.
      </Alert>
    </Box>
  );
}
