"use client";
// src/app/components/Session/DownloadButton.tsx

interface Props {
  text: string;
  sessionId: string;
}

export default function DownloadButton({ text, sessionId }: Props) {
  function download() {
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qlave-transcript-${sessionId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <button
      onClick={download}
      style={{
        fontSize: 13, fontWeight: 500, padding: "7px 14px",
        borderRadius: 7, cursor: "pointer", border: "none",
        background: "#7c3aed", color: "#fff", fontFamily: "inherit",
      }}
    >
      Download .txt
    </button>
  );
}