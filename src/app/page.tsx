"use client";

import { useState, useEffect, useRef } from "react";

// ─── Icon Components ─────────────────────────────────────────────────────

function CircuitIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h3l3-9 4 18 4-18 3 9h3" />
    </svg>
  );
}

function ChipIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function AIICon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4v1a1 1 0 0 0 1 1h1a4 4 0 0 1 0 8h-1a1 1 0 0 0-1 1v1a4 4 0 0 1-8 0v-1a1 1 0 0 0-1-1H6a4 4 0 0 1 0-8h1a1 1 0 0 0 1-1V6a4 4 0 0 1 4-4z" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function CodeIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function WifiIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" />
    </svg>
  );
}

function OscilloscopeIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M6 10h2l2-3 3 6 2-3h3" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function GraduationIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 1.657 2.686 3 6 3s6-1.343 6-3v-5" />
    </svg>
  );
}

function ExportIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ShieldIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function LayersIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function SearchIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  features: string[];
  highlights: string[];
}

const PRODUCTS: Product[] = [
  {
    id: "simulator",
    name: "Eesha Simulator",
    tagline: "Real-time circuit simulation",
    description: "SPICE-accurate analog simulation powered by ngspice WebAssembly. Run real firmware for 19+ microcontroller boards directly in your browser with cycle-accurate emulation.",
    icon: <CircuitIcon className="w-8 h-8" />,
    gradient: "from-emerald-500 to-teal-600",
    features: [
      "SPICE analog simulation (ngspice WASM) at 60 Hz solve rate",
      "Hybrid digital + analog co-simulation",
      "100+ SPICE-accurate components (BJTs, MOSFETs, op-amps, regulators)",
      "Live oscilloscope, voltmeter, ammeter, signal generator",
      "Non-linear device behavior (real silicon response)",
    ],
    highlights: ["ngspice WASM", "60 Hz solve", "100+ parts", "Oscilloscope"],
  },
  {
    id: "emulator",
    name: "Eesha Emulator",
    tagline: "19 boards, 5 architectures",
    description: "Cycle-accurate and instruction-accurate microcontroller emulation across AVR8, ARM Cortex-M0+, RISC-V, Xtensa, and ARM Cortex-A53 — from ATtiny85 to Raspberry Pi 3B.",
    icon: <ChipIcon className="w-8 h-8" />,
    gradient: "from-violet-500 to-purple-600",
    features: [
      "AVR8: Arduino Uno, Nano, Mega, ATtiny85, Leonardo, Pro Mini",
      "ARM M0+: Raspberry Pi Pico, Pico W",
      "RISC-V: ESP32-C3, CH32V003, XIAO ESP32-C3",
      "Xtensa: ESP32, ESP32-S3, ESP32-CAM (Rust/WASM)",
      "ARM A53: Raspberry Pi 3B with full Linux + Python",
    ],
    highlights: ["19 boards", "5 architectures", "ESP32-S3 Rust", "RPi 3B Linux"],
  },
  {
    id: "ai",
    name: "Eesha AI",
    tagline: "AI-powered electronics design",
    description: "Let AI wire your circuits, generate code, and answer questions about your design. Auto-wiring, code generation for any board, and circuit-aware Q&A — your AI electronics assistant.",
    icon: <AIICon className="w-8 h-8" />,
    gradient: "from-rose-500 to-pink-600",
    features: [
      "AI auto-wiring: place parts and let AI connect them",
      "Code generation for Arduino, ESP32, RPi Pico",
      "Circuit-aware Q&A: ask about your design in context",
      "AI-generated custom part simulation behavior",
      "Debug assistance and circuit optimization suggestions",
    ],
    highlights: ["Auto-wiring", "Code gen", "Circuit Q&A", "Debug assist"],
  },
  {
    id: "editor",
    name: "Eesha Editor",
    tagline: "Professional code editor",
    description: "Monaco-powered code editor with C++, Python syntax highlighting, autocomplete, multi-file workspace, serial monitor, and library manager — VS Code experience in your browser.",
    icon: <CodeIcon className="w-8 h-8" />,
    gradient: "from-sky-500 to-blue-600",
    features: [
      "Monaco Editor (VS Code engine) with full intellisense",
      "arduino-cli backend: real .hex / .uf2 / .bin compilation",
      "Multi-file workspace: .ino, .h, .cpp, .py",
      "Serial Monitor with auto baud-rate detection",
      "Full Arduino Library Manager integration",
    ],
    highlights: ["Monaco Editor", "arduino-cli", "Serial Monitor", "Libraries"],
  },
  {
    id: "iot",
    name: "Eesha IoT",
    tagline: "Wi-Fi & IoT simulation",
    description: "Simulate Wi-Fi workflows, MQTT, HTTP, WebSocket, and UDP protocols in the browser. Test IoT projects end-to-end before touching real hardware.",
    icon: <WifiIcon className="w-8 h-8" />,
    gradient: "from-amber-500 to-orange-600",
    features: [
      "Wi-Fi simulation for ESP32 and ESP32-S3",
      "MQTT protocol testing with broker simulation",
      "HTTP/HTTPS request simulation",
      "WebSocket and UDP protocol support",
      "End-to-end IoT workflow prototyping",
    ],
    highlights: ["Wi-Fi sim", "MQTT", "HTTP/S", "WebSocket"],
  },
  {
    id: "instruments",
    name: "Eesha Instruments",
    tagline: "Live measurement tools",
    description: "Professional-grade virtual instruments for real-time circuit analysis. Multi-channel oscilloscope, precision voltmeter/ammeter, and programmable signal generator.",
    icon: <OscilloscopeIcon className="w-8 h-8" />,
    gradient: "from-cyan-500 to-teal-600",
    features: [
      "Multi-channel real-time oscilloscope",
      "Precision voltmeter (node voltage measurement)",
      "Ammeter (branch current measurement)",
      "Signal generator: sine, square, DC, triangle",
      "Frequency and phase analysis",
    ],
    highlights: ["Oscilloscope", "Voltmeter", "Ammeter", "Signal Gen"],
  },
  {
    id: "education",
    name: "Eesha Classroom",
    tagline: "Learn electronics interactively",
    description: "Chromebook-compatible, AI-assisted learning platform for students and classrooms. Interactive lessons, guided projects, and real-time feedback — no hardware needed.",
    icon: <GraduationIcon className="w-8 h-8" />,
    gradient: "from-lime-500 to-green-600",
    features: [
      "Works on Chromebooks — no desktop IDE needed",
      "AI tutor for students when instructors are busy",
      "Interactive guided lessons with real simulation",
      "40+ analog & hybrid example projects",
      "Classroom management & assignments (coming soon)",
    ],
    highlights: ["Chromebook", "AI Tutor", "40+ Examples", "Classrooms"],
  },
  {
    id: "export",
    name: "Eesha Export",
    tagline: "From browser to hardware",
    description: "Generate professional wiring diagrams, share projects via link, and flash firmware directly to connected Arduino, ESP32, or Raspberry Pi Pico — from the browser.",
    icon: <ExportIcon className="w-8 h-8" />,
    gradient: "from-fuchsia-500 to-pink-600",
    features: [
      "Professional wiring diagram generation",
      "Project sharing via URL",
      "Direct firmware flash to real hardware",
      "Custom parts editor with pin definitions",
      "Project documentation export",
    ],
    highlights: ["Wiring Diagrams", "Share Links", "Flash Firmware", "Custom Parts"],
  },
];

const BOARDS = [
  { name: "Arduino Uno", arch: "AVR8", freq: "16 MHz" },
  { name: "Arduino Nano", arch: "AVR8", freq: "16 MHz" },
  { name: "Arduino Mega 2560", arch: "AVR8", freq: "16 MHz" },
  { name: "ATtiny85", arch: "AVR8", freq: "8 MHz" },
  { name: "Arduino Leonardo", arch: "AVR8", freq: "16 MHz" },
  { name: "Raspberry Pi Pico", arch: "ARM M0+", freq: "133 MHz" },
  { name: "Raspberry Pi Pico W", arch: "ARM M0+", freq: "133 MHz" },
  { name: "ESP32-C3 DevKit", arch: "RISC-V", freq: "160 MHz" },
  { name: "CH32V003", arch: "RISC-V", freq: "48 MHz" },
  { name: "ESP32 DevKit V1", arch: "Xtensa", freq: "240 MHz" },
  { name: "ESP32-S3", arch: "Xtensa", freq: "240 MHz" },
  { name: "ESP32-CAM", arch: "Xtensa", freq: "240 MHz" },
  { name: "Raspberry Pi 3B", arch: "ARM A53", freq: "1.2 GHz" },
];

const STATS = [
  { label: "Supported Boards", value: "19+", icon: <ChipIcon className="w-5 h-5" /> },
  { label: "CPU Architectures", value: "5", icon: <LayersIcon className="w-5 h-5" /> },
  { label: "Components", value: "30,000+", icon: <CircuitIcon className="w-5 h-5" /> },
  { label: "SPICE Parts", value: "100+", icon: <OscilloscopeIcon className="w-5 h-5" /> },
];

// ─── Main Component ──────────────────────────────────────────────────────

export default function EeshaLearn() {
  const [activeProduct, setActiveProduct] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Intersection observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-section");
            if (id) setVisibleSections((prev) => new Set(prev).add(id));
          }
        });
      },
      { threshold: 0.1 }
    );

    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const filteredProducts = PRODUCTS.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.features.some((f) => f.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const setRef = (id: string, el: HTMLDivElement | null) => {
    if (el) sectionRefs.current.set(id, el);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a1a]">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#0a0a1a]/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CircuitIcon className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">
              Eesha<span className="text-emerald-400">Learn</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
            <a href="#products" className="hover:text-white transition-colors">Products</a>
            <a href="#boards" className="hover:text-white transition-colors">Boards</a>
            <a href="#components" className="hover:text-white transition-colors">Components</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
          </div>
          <button className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-emerald-500/25 transition-all">
            Open Simulator
          </button>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        ref={(el) => { if (el) sectionRefs.current.set("hero", el); }}
        data-section="hero"
        className="relative overflow-hidden"
      >
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-500/5 rounded-full blur-3xl" />
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
        </div>

        <div className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 text-center transition-all duration-700 ${visibleSections.has("hero") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-8">
            <ShieldIcon className="w-4 h-4" />
            100% Browser-Based — No Installation Required
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white mb-6 leading-tight">
            The Ultimate
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
              IoT Simulation Platform
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">
            AI-powered circuit design, SPICE-accurate simulation, 19+ microcontroller boards,
            30,000+ components — design, simulate, and deploy IoT projects entirely in your browser.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-12">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/5">
                <div className="flex items-center justify-center gap-2 text-emerald-400 mb-1">
                  {stat.icon}
                </div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:shadow-xl hover:shadow-emerald-500/25 transition-all text-lg">
              Start Building Free
            </button>
            <button className="px-8 py-3.5 bg-white/5 text-white font-semibold rounded-xl border border-white/10 hover:bg-white/10 transition-all text-lg">
              View Examples
            </button>
          </div>
        </div>
      </section>

      {/* ── Our Products ────────────────────────────────────────────────── */}
      <section
        id="products"
        ref={(el) => setRef("products", el)}
        data-section="products"
        className="py-24 relative"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`text-center mb-16 transition-all duration-700 ${visibleSections.has("products") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
              Our Products
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Everything you need to design, simulate, and deploy IoT projects — all in one platform.
            </p>

            {/* Search */}
            <div className="max-w-md mx-auto mt-8 relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products & features..."
                className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 text-sm focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 transition-all"
              />
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {filteredProducts.map((product, i) => (
              <div
                key={product.id}
                onClick={() => setActiveProduct(activeProduct === product.id ? null : product.id)}
                className={`group relative cursor-pointer transition-all duration-500 ${
                  visibleSections.has("products") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: `${i * 75}ms` }}
              >
                <div className={`relative h-full rounded-2xl border transition-all duration-300 overflow-hidden ${
                  activeProduct === product.id
                    ? "border-white/20 bg-white/10 shadow-2xl scale-[1.02]"
                    : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/5 hover:shadow-xl"
                }`}>
                  {/* Gradient accent line */}
                  <div className={`h-1 w-full bg-gradient-to-r ${product.gradient}`} />

                  <div className="p-6">
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${product.gradient} flex items-center justify-center text-white mb-4 shadow-lg`}>
                      {product.icon}
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                      {product.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-3">{product.tagline}</p>

                    {/* Description */}
                    <p className="text-sm text-gray-400 leading-relaxed mb-4 line-clamp-3">
                      {product.description}
                    </p>

                    {/* Highlight badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {product.highlights.map((h) => (
                        <span
                          key={h}
                          className="px-2 py-0.5 text-[11px] font-medium bg-white/5 border border-white/10 rounded-full text-gray-400"
                        >
                          {h}
                        </span>
                      ))}
                    </div>

                    {/* Expanded features */}
                    {activeProduct === product.id && (
                      <div className="mt-5 pt-4 border-t border-white/10">
                        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">Key Features</h4>
                        <ul className="space-y-2">
                          {product.features.map((f, fi) => (
                            <li key={fi} className="flex items-start gap-2 text-sm text-gray-300">
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supported Boards ────────────────────────────────────────────── */}
      <section
        id="boards"
        ref={(el) => setRef("boards", el)}
        data-section="boards"
        className="py-24 bg-gradient-to-b from-transparent via-emerald-500/[0.02] to-transparent"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`text-center mb-16 transition-all duration-700 ${visibleSections.has("boards") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
              19+ Boards Supported
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              From 8-pin ATtiny85 to Raspberry Pi 3B running Linux — 5 CPU architectures emulated in your browser.
            </p>
          </div>

          {/* Architecture cards */}
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-700 ${visibleSections.has("boards") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {[
              {
                arch: "AVR8",
                engine: "avr8js — Browser-native JS",
                color: "from-emerald-500 to-teal-600",
                boards: ["Arduino Uno (ATmega328P)", "Arduino Nano", "Arduino Mega 2560 (ATmega2560)", "ATtiny85 (8KB, DIP-8)", "Arduino Leonardo (ATmega32u4)", "Arduino Pro Mini"],
              },
              {
                arch: "ARM Cortex-M0+",
                engine: "rp2040js — Browser-native JS",
                color: "from-violet-500 to-purple-600",
                boards: ["Raspberry Pi Pico (RP2040)", "Raspberry Pi Pico W (RP2040 + WiFi)"],
              },
              {
                arch: "RISC-V",
                engine: "Browser-native RV32IMC/EC",
                color: "from-sky-500 to-blue-600",
                boards: ["ESP32-C3 DevKit (RV32IMC)", "Seeed XIAO ESP32-C3", "ESP32-C3 SuperMini", "CH32V003 (RV32EC, DIP-8)"],
              },
              {
                arch: "Xtensa",
                engine: "Rust/WASM + QEMU",
                color: "from-amber-500 to-orange-600",
                boards: ["ESP32 DevKit V1 (LX6, WiFi)", "ESP32-S3 (LX7, Dual-core)", "ESP32-CAM (Camera module)", "Seeed XIAO ESP32-S3", "Arduino Nano ESP32"],
              },
              {
                arch: "ARM Cortex-A53",
                engine: "QEMU raspi3b — Full Linux",
                color: "from-rose-500 to-pink-600",
                boards: ["Raspberry Pi 3B (Full Linux OS)", "Runs Python with RPi.GPIO"],
              },
              {
                arch: "Custom Chips",
                engine: "WASI + WASM (C/Rust/AS)",
                color: "from-cyan-500 to-teal-600",
                boards: ["Write in C, Rust, or AssemblyScript", "Compile to WebAssembly", "Full pin I/O, I²C, SPI support", "Save & reuse across projects"],
              },
            ].map((group) => (
              <div key={group.arch} className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all">
                <div className={`h-1 bg-gradient-to-r ${group.color}`} />
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${group.color} flex items-center justify-center text-white text-xs font-bold`}>
                      {group.arch.split(" ")[0].substring(0, 3)}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">{group.arch}</h3>
                      <p className="text-[11px] text-gray-500">{group.engine}</p>
                    </div>
                  </div>
                  <ul className="space-y-1.5">
                    {group.boards.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-sm text-gray-400">
                        <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Component Library ───────────────────────────────────────────── */}
      <section
        id="components"
        ref={(el) => setRef("components", el)}
        data-section="components"
        className="py-24"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`text-center mb-16 transition-all duration-700 ${visibleSections.has("components") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
              30,000+ Components
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Everything from basic resistors to complex sensors, displays, and communication modules.
            </p>
          </div>

          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 transition-all duration-700 ${visibleSections.has("components") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {[
              { name: "Resistors", count: "100+", icon: "⏛", color: "from-emerald-500/20 to-emerald-600/20" },
              { name: "Capacitors", count: "50+", icon: "⚡", color: "from-amber-500/20 to-amber-600/20" },
              { name: "LEDs", count: "20+", icon: "💡", color: "from-red-500/20 to-red-600/20" },
              { name: "Sensors", count: "200+", icon: "🌡️", color: "from-sky-500/20 to-sky-600/20" },
              { name: "Displays", count: "50+", icon: "🖥️", color: "from-violet-500/20 to-violet-600/20" },
              { name: "Motors", count: "30+", icon: "⚙️", color: "from-orange-500/20 to-orange-600/20" },
              { name: "Op-Amps", count: "20+", icon: "📐", color: "from-teal-500/20 to-teal-600/20" },
              { name: "BJTs", count: "15+", icon: "🔺", color: "from-rose-500/20 to-rose-600/20" },
              { name: "MOSFETs", count: "10+", icon: "⬛", color: "from-indigo-500/20 to-indigo-600/20" },
              { name: "MCU Boards", count: "19+", icon: "🔧", color: "from-cyan-500/20 to-cyan-600/20" },
              { name: "Comms", count: "50+", icon: "📡", color: "from-lime-500/20 to-lime-600/20" },
              { name: "Logic ICs", count: "100+", icon: "⊞", color: "from-fuchsia-500/20 to-fuchsia-600/20" },
            ].map((cat) => (
              <div
                key={cat.name}
                className={`bg-gradient-to-br ${cat.color} border border-white/5 rounded-2xl p-5 text-center hover:border-white/15 hover:scale-105 transition-all cursor-default`}
              >
                <div className="text-3xl mb-2">{cat.icon}</div>
                <div className="text-sm font-semibold text-white">{cat.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{cat.count}</div>
              </div>
            ))}
          </div>

          {/* Popular component callouts */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: "SPICE-Accurate Analog",
                items: "2N2222, 2N3055, LM358, LM741, TL072, 7805, LM317, 1N4148, 1N4007, IRF540, optocouplers, relays, logic ICs",
                gradient: "from-emerald-500 to-teal-600",
              },
              {
                title: "Wokwi Visual Components",
                items: "LEDs, buttons, potentiometers, servos, HC-SR04, NeoPixels, LCD 16x2, ILI9341 TFT, 7-segment, DHT22, DS3231, logic gates",
                gradient: "from-violet-500 to-purple-600",
              },
              {
                title: "Custom Parts Editor",
                items: "Create your own sensors, actuators, and modules with custom visuals, pin definitions, and AI-generated simulation behavior",
                gradient: "from-rose-500 to-pink-600",
              },
            ].map((section) => (
              <div key={section.title} className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all">
                <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${section.gradient} text-white mb-3`}>
                  {section.title}
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{section.items}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section
        id="features"
        ref={(el) => setRef("features", el)}
        data-section="features"
        className="py-24 bg-gradient-to-b from-transparent via-violet-500/[0.02] to-transparent"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`text-center mb-16 transition-all duration-700 ${visibleSections.has("features") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
              Design → Simulate → Deploy
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Three steps from idea to working hardware. No software to install, no boards to buy first.
            </p>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-3 gap-8 transition-all duration-700 ${visibleSections.has("features") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {[
              {
                step: "01",
                title: "Design with AI",
                desc: "Drag components onto the canvas. Let AI auto-wire them. Or describe what you want and let AI generate the entire circuit and code.",
                gradient: "from-emerald-500 to-teal-600",
                features: ["AI auto-wiring", "Code generation", "Custom parts editor", "30,000+ component library"],
              },
              {
                step: "02",
                title: "Simulate in Browser",
                desc: "Run real firmware on 19+ emulated boards with SPICE-accurate analog simulation. Watch LEDs, displays, and motors respond in real-time.",
                gradient: "from-violet-500 to-purple-600",
                features: ["SPICE analog simulation", "19 board emulators", "Live instruments", "Wi-Fi & IoT protocols"],
              },
              {
                step: "03",
                title: "Deploy to Hardware",
                desc: "Export wiring diagrams, share projects, or flash firmware directly to your Arduino, ESP32, or Raspberry Pi Pico from the browser.",
                gradient: "from-rose-500 to-pink-600",
                features: ["Wiring diagram export", "Firmware flash via USB", "Share projects via link", "Project documentation"],
              },
            ].map((s) => (
              <div key={s.step} className="relative group">
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative bg-white/[0.02] border border-white/5 rounded-2xl p-8 hover:border-white/10 transition-all h-full">
                  <div className={`text-5xl font-black bg-gradient-to-r ${s.gradient} bg-clip-text text-transparent mb-4`}>
                    {s.step}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{s.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed mb-5">{s.desc}</p>
                  <div className="space-y-2">
                    {s.features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-gray-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison Banner ────────────────────────────────────────────── */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-2xl p-8 sm:p-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Why Eesha Learn?
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto mb-8">
              Combining the SPICE simulation power of Velxio with the AI design intelligence of Cirkit Designer — reimagined as one seamless platform.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "No Install", value: "100% Browser" },
                { label: "AI Powered", value: "Auto-Wire + Code Gen" },
                { label: "SPICE Accurate", value: "Real Silicon Behavior" },
                { label: "Open Source", value: "AGPL v3 License" },
              ].map((item) => (
                <div key={item.label} className="bg-white/5 rounded-xl p-4">
                  <div className="text-sm font-bold text-white">{item.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-6">
            Ready to Build?
          </h2>
          <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
            Start designing, simulating, and deploying IoT projects for free. No account needed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="px-10 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:shadow-xl hover:shadow-emerald-500/25 transition-all text-lg">
              Launch Eesha Learn
            </button>
            <button className="px-10 py-4 bg-white/5 text-white font-semibold rounded-xl border border-white/10 hover:bg-white/10 transition-all text-lg">
              View Documentation
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-white/5 bg-[#0a0a1a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <CircuitIcon className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-white text-sm">Eesha<span className="text-emerald-400">Learn</span></span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                The ultimate browser-based IoT simulation platform. AI-powered circuit design, SPICE simulation, and 19+ microcontroller emulators.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Products</h4>
              <ul className="space-y-1.5">
                {PRODUCTS.slice(0, 5).map((p) => (
                  <li key={p.id}><a href="#products" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">{p.name}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Resources</h4>
              <ul className="space-y-1.5 text-xs text-gray-500">
                <li><a href="#" className="hover:text-gray-300 transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-gray-300 transition-colors">Example Projects</a></li>
                <li><a href="#" className="hover:text-gray-300 transition-colors">Component Library</a></li>
                <li><a href="#" className="hover:text-gray-300 transition-colors">Custom Chips API</a></li>
                <li><a href="#" className="hover:text-gray-300 transition-colors">MCP Server (AI)</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Company</h4>
              <ul className="space-y-1.5 text-xs text-gray-500">
                <li><a href="#" className="hover:text-gray-300 transition-colors">About Eesha</a></li>
                <li><a href="#" className="hover:text-gray-300 transition-colors">Eesha Browser</a></li>
                <li><a href="#" className="hover:text-gray-300 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-gray-300 transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-gray-300 transition-colors">GitHub</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-600">
              © 2026 Eesha Learn. Powered by Velxio + Cirkit Designer. AGPL v3 License.
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-600">
              <span>SPICE by ngspice</span>
              <span>•</span>
              <span>AVR8 by avr8js</span>
              <span>•</span>
              <span>RP2040 by rp2040js</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
