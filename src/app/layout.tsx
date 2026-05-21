import './globals.css'

export const metadata = {
  title: 'Eesha Learn — IoT Simulation Platform',
  description: 'The ultimate browser-based IoT simulation platform. AI-powered circuit design, SPICE simulation, 19+ microcontroller boards, 30,000+ components — all in your browser.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a1a] text-gray-100 antialiased">{children}</body>
    </html>
  )
}
