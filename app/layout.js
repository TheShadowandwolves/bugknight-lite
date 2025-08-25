// app/layout.jsx
export const metadata = { title: "Bugknight Lite", description: "Hollow-Knight-like starter in Next.js + Phaser" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0f0f13", color: "#eaeaea", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}