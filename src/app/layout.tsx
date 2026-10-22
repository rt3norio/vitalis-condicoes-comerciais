import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vitalis · Condições comerciais",
  description: "Do e-mail do fornecedor à condição gravada no ERP, com conferência humana.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <TooltipProvider>
          <header className="border-b bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-teal-700 text-sm font-bold text-white">V</span>
                <span className="leading-tight">
                  <span className="block font-semibold">Vitalis</span>
                  <span className="block text-xs text-zinc-500">Condições comerciais de fornecedores</span>
                </span>
              </Link>
              <nav className="flex items-center gap-4 text-sm text-zinc-600">
                <Link href="/" className="hover:text-zinc-900">Painel</Link>
                <Link href="/erp" className="hover:text-zinc-900">ERP (simulado)</Link>
                <a href="/politica-comercial.pdf" target="_blank" className="hover:text-zinc-900">Política POL-COM-004</a>
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
          <Toaster richColors position="top-center" />
        </TooltipProvider>
      </body>
    </html>
  );
}
