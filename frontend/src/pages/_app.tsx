import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <style jsx global>{`
        body {
          font-family: "Segoe UI", "Trebuchet MS", system-ui, sans-serif;
          margin: 0;
          padding: 0;
          background:
            radial-gradient(circle at top left, rgba(214, 115, 52, 0.12), transparent 28%),
            radial-gradient(circle at right 15%, rgba(19, 78, 74, 0.1), transparent 24%),
            linear-gradient(180deg, #f7f2ea 0%, #efe6d8 100%);
          color: #1e2430;
        }
        body::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(120, 101, 78, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(120, 101, 78, 0.05) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.8), transparent 90%);
        }
        a {
          color: inherit;
        }
        button,
        input,
        textarea,
        select {
          font: inherit;
        }
        * {
          box-sizing: border-box;
        }
        ::selection {
          background: rgba(139, 94, 52, 0.22);
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
