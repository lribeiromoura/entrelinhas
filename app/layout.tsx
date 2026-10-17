import "./style.css";
export const metadata = {
  title: "Entrelinhas · sua biblioteca",
  description: "Livros, ideias e lembranças em um só lugar.",
  manifest: "/manifest.webmanifest",
};
export const viewport = { themeColor: "#244f43" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
