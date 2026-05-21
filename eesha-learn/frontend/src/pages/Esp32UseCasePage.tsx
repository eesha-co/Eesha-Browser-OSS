/**
 * /esp32-simulator — ESP32 Use-Case Page
 * Modeled after Cirkit Designer's esp32-simulator.html, rebranded for Eesha Learn.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu,
  Zap,
  Play,
  Upload,
  ArrowRight,
  ChevronRight,
  Wifi,
  Globe,
  Radio,
  Satellite,
  Thermometer,
  Lock,
  Gamepad2,
  Bot,
  Lightbulb,
  Monitor,
  Cable,
} from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import { useSEO } from '../utils/useSEO';
import { trackClickCTA } from '../utils/analytics';
import './ArduinoUseCasePage.css';

/* ── SEO metadata ─────────────────────────────────────── */
const SEO_META = {
  title: 'ESP32 Simulator Online — Design & Simulate ESP32 Projects | Eesha Learn',
  description:
    'Simulate ESP32 projects in your browser. Start with ESP32-S3, use AI help for wiring and code, test Wi-Fi workflows, and export diagrams. Free and open-source.',
  url: 'https://eesha-learn.dev/esp32-simulator',
};

const FAQ_ITEMS = [
  {
    q: 'What can I do with Eesha Learn\'s ESP32 simulator?',
    a: 'Build ESP32 projects in the browser with Eesha Learn. Supports ESP32-S3 simulation with Arduino sketches, connected components, and Wi-Fi workflows.',
  },
  {
    q: 'Is Eesha Learn free to start?',
    a: 'Eesha Learn is completely free and open-source. No account, no payment, no cloud subscription. Run it in your browser or self-host with Docker.',
  },
  {
    q: 'Which ESP32 boards does Eesha Learn support?',
    a: 'Eesha Learn supports ESP32-S3 simulation today. Start with ESP32-S3, then add sensors, displays, buttons, motors, and other connected modules. We are working to expand support for more ESP32 variants.',
  },
  {
    q: 'Can I simulate ESP32 Wi-Fi projects online?',
    a: 'Eesha Learn\'s ESP32-S3 simulator supports Wi-Fi workflows such as HTTP, MQTT, WebSocket, and UDP for connected IoT-style projects in the browser.',
  },
  {
    q: 'Can Eesha Learn AI help with ESP32 projects?',
    a: 'Eesha Learn\'s AI assistant can help with wiring, code generation, circuit questions, and troubleshooting issues as you design and simulate.',
  },
  {
    q: 'Can I build the real circuit after simulation?',
    a: 'Use the simulated project as a build reference, then export the wiring diagram, share the project, or upload firmware to supported hardware when you are ready.',
  },
];

const JSON_LD: object[] = [
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://eesha-learn.dev/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'ESP32 Simulator',
        item: 'https://eesha-learn.dev/esp32-simulator',
      },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  },
];

/* ── Data ─────────────────────────────────────────────── */
const BOARD_STARTER = {
  name: 'ESP32-S3 DevKit',
  description:
    'Run Arduino sketches with connected components, GPIO, Wi-Fi, and IoT workflows.',
  chips: ['Arduino sketches', 'GPIO, I2C, SPI', 'Wi-Fi, MQTT, HTTP', 'PWM and ADC'],
  icon: Cpu,
  link: '/editor',
};

const PROJECT_GALLERY = [
  {
    title: 'Wi-Fi crypto price tracker',
    description:
      'Simulate an ESP32-S3 Wi-Fi project that fetches price data and renders it on an ILI9341 display.',
    icon: Globe,
    link: '/examples',
  },
  {
    title: 'Pong game with OLED',
    description: 'Run game logic on ESP32-S3 with OLED output and pushbutton paddle controls.',
    icon: Gamepad2,
    link: '/examples',
  },
  {
    title: 'Hotel safe',
    description:
      'Use a keypad, LCD, and servo to simulate a lock project with ESP32-S3 control.',
    icon: Lock,
    link: '/examples',
  },
  {
    title: 'DHT11 temperature sensor',
    description: 'Read temperature and humidity from a DHT11 sensor in an ESP32-S3 simulation.',
    icon: Thermometer,
    link: '/examples',
  },
  {
    title: 'Bot with L298N driver',
    description: 'Control two DC motors through an L298N driver from an ESP32-S3 project.',
    icon: Bot,
    link: '/examples',
  },
  {
    title: 'Chained NeoPixel rings',
    description:
      'Animate WS2812-style LEDs and test timing-sensitive output before wiring the rings.',
    icon: Lightbulb,
    link: '/examples',
  },
];

const WIFI_WORKFLOWS = [
  {
    name: 'MQTT',
    description: 'Publish and subscribe to MQTT messages for real-time IoT communication.',
    icon: Radio,
  },
  {
    name: 'HTTP / HTTPS',
    description: 'Fetch data from REST APIs and serve web content directly from your ESP32.',
    icon: Globe,
  },
  {
    name: 'WebSocket',
    description: 'Full-duplex communication for dashboards and live data streaming.',
    icon: Satellite,
  },
  {
    name: 'UDP',
    description: 'Low-latency packet transmission for sensor networks and custom protocols.',
    icon: Wifi,
  },
];

/* ── Component ────────────────────────────────────────── */
export const Esp32UseCasePage: React.FC = () => {
  useSEO({ ...SEO_META, jsonLd: JSON_LD });

  return (
    <div className="usecase-page">
      <AppHeader />
      <main>
        {/* ── Hero ──────────────────────────────────────── */}
        <section className="uc-hero">
          <div className="uc-hero-copy">
            <nav className="uc-breadcrumbs" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <span>/</span>
              <span>ESP32 Simulator</span>
            </nav>
            <p className="uc-eyebrow">Online ESP32 Simulator</p>
            <h1>
              Design and simulate ESP32 projects{' '}
              <span className="uc-accent">in your browser.</span>
            </h1>
            <p className="uc-hero-lede">
              Use Eesha Learn AI to help with wiring and code, then simulate ESP32-S3 firmware,
              connected components, and Wi-Fi workflows before you build.
            </p>
            <div className="uc-hero-actions">
              <Link
                to="/editor"
                className="cta-primary"
                onClick={() => trackClickCTA('esp32-usecase', '/editor')}
              >
                Start with ESP32-S3 <ArrowRight size={16} />
              </Link>
              <Link to="#examples" className="cta-secondary">
                View ESP32 examples
              </Link>
            </div>
          </div>
          <div className="uc-hero-visual" role="img" aria-label="ESP32 simulation preview">
            <div className="uc-hero-visual-icon">
              <Cable size={120} />
            </div>
          </div>
        </section>

        {/* ── Start with ESP32-S3 ───────────────────────── */}
        <section className="uc-section">
          <div className="uc-section-header">
            <p className="uc-eyebrow">ESP32 board</p>
            <h2>Start with ESP32-S3.</h2>
            <p>
              Write Arduino sketches, connect sensors and displays, and simulate ESP32-S3 behavior
              in the browser.
            </p>
          </div>
          <div className="uc-starter-grid" style={{ gridTemplateColumns: '1fr' }}>
            <Link
              to={BOARD_STARTER.link}
              className="uc-starter-card uc-starter-featured"
              onClick={() => trackClickCTA('esp32-usecase-starter', BOARD_STARTER.link)}
            >
              <span className="uc-starter-badge">Wi-Fi Enabled</span>
              <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="uc-starter-board-icon" style={{ width: 64, height: 64 }}>
                  <BOARD_STARTER.icon size={32} />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h3>{BOARD_STARTER.name}</h3>
                  <p>{BOARD_STARTER.description}</p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                    {BOARD_STARTER.chips.map((chip) => (
                      <span
                        key={chip}
                        style={{
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono)',
                          background: 'rgba(0, 113, 227, 0.12)',
                          color: 'var(--accent)',
                          letterSpacing: '0.3px',
                        }}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <span className="uc-starter-cta">
                Start with ESP32-S3 <ChevronRight size={14} />
              </span>
            </Link>
          </div>
        </section>

        {/* ── Project gallery ───────────────────────────── */}
        <section className="uc-section-alt" id="examples">
          <div className="uc-section-inner">
            <div className="uc-section-header">
              <p className="uc-eyebrow">ESP32 project gallery</p>
              <h2>Explore real ESP32 projects.</h2>
              <p>
                Open real ESP32-S3 projects, inspect the wiring, run the simulation, and adapt them
                for your own build.
              </p>
            </div>
            <div className="uc-gallery-grid">
              {PROJECT_GALLERY.map((project) => {
                const Icon = project.icon;
                return (
                  <Link
                    key={project.title}
                    to={project.link}
                    className="uc-gallery-card"
                    onClick={() => trackClickCTA('esp32-usecase-gallery', project.link)}
                  >
                    <div className="uc-gallery-thumb">
                      <Icon size={40} />
                    </div>
                    <div className="uc-gallery-body">
                      <h3>{project.title}</h3>
                      <p>{project.description}</p>
                      <span className="uc-gallery-link">
                        Open project <ArrowRight size={13} />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="uc-gallery-more">
              <Link to="/examples" className="cta-secondary">
                View all featured projects
              </Link>
            </div>
          </div>
        </section>

        {/* ── Under the Hood ────────────────────────────── */}
        <section className="uc-section">
          <div className="uc-proof-panel">
            <div className="uc-proof-copy">
              <p className="uc-eyebrow">Under the hood</p>
              <h2>Runs real ESP32-S3 firmware in your browser.</h2>
              <p>
                Eesha Learn&apos;s ESP32-S3 simulator uses QEMU-based Xtensa emulation compiled to
                WebAssembly. Arduino sketches compile to real firmware, then run locally in the
                browser against the circuit you build on the canvas.
              </p>
              <p>
                That keeps ESP32 projects interactive without backend simulation sessions, streamed
                device state, or hardware setup.
              </p>
              <Link to="/docs/esp32-emulation" className="uc-proof-link">
                Read how we built the ESP32-S3 simulator <ArrowRight size={14} />
              </Link>
            </div>
            <div className="uc-proof-grid" aria-label="ESP32-S3 simulator technical details">
              <div className="uc-proof-item">
                <span>Rust + WebAssembly</span>
                <p>
                  The emulator runs locally in the browser, next to the circuit editor. No cloud
                  dependency.
                </p>
              </div>
              <div className="uc-proof-item">
                <span>Real Xtensa firmware</span>
                <p>
                  Compiled sketches run as firmware instead of mocked ESP32-like behavior — byte for
                  byte what runs on real hardware.
                </p>
              </div>
              <div className="uc-proof-item">
                <span>Wi-Fi workflows</span>
                <p>
                  Use HTTP, HTTPS, MQTT, WebSocket, and UDP project flows — all simulated in the
                  browser.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Wi-Fi / IoT Workflows ─────────────────────── */}
        <section className="uc-section-alt">
          <div className="uc-section-inner">
            <div className="uc-section-header">
              <p className="uc-eyebrow">Wi-Fi &amp; IoT</p>
              <h2>Simulate connected workflows.</h2>
              <p>
                Test Wi-Fi protocols and IoT patterns directly in the browser — no physical hardware
                or router needed.
              </p>
            </div>
            <div className="uc-wifi-grid">
              {WIFI_WORKFLOWS.map((wf) => {
                const Icon = wf.icon;
                return (
                  <div className="uc-wifi-card" key={wf.name}>
                    <div className="uc-wifi-icon">
                      <Icon size={20} />
                    </div>
                    <h3>{wf.name}</h3>
                    <p>{wf.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Why Eesha Learn ───────────────────────────── */}
        <section className="uc-section">
          <div className="uc-section-header">
            <p className="uc-eyebrow">Why Eesha Learn</p>
            <h2>Design with AI. Test in simulation. Build when ready.</h2>
            <p>
              Use Eesha Learn AI to help wire your ESP32 project, generate code, and troubleshoot as
              you build. Then run ESP32-S3 simulations in the browser and export diagrams, share the
              project, or upload firmware when you are ready to build.
            </p>
          </div>
          <div className="uc-compare-grid">
            <div className="uc-compare-card">
              <div className="uc-compare-icon">
                <Zap size={22} />
              </div>
              <h3>Start with AI assistance</h3>
              <p>
                Ask Eesha Learn for help wiring parts, generating code, and debugging your ESP32
                project as you build.
              </p>
            </div>
            <div className="uc-compare-card uc-compare-featured">
              <div className="uc-compare-icon">
                <Play size={22} />
              </div>
              <h3>Simulate connected projects</h3>
              <p>
                Run ESP32-S3 code while sensors, displays, motors, buttons, LEDs, and Wi-Fi
                workflows respond in the same workspace.
              </p>
            </div>
            <div className="uc-compare-card">
              <div className="uc-compare-icon">
                <Upload size={22} />
              </div>
              <h3>Export and build</h3>
              <p>
                Download the wiring diagram, share the project, or upload firmware to supported
                hardware when you are ready to build.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────── */}
        <section className="uc-section-alt">
          <div className="uc-section-inner">
            <div className="uc-faq-grid">
              <div>
                <p className="uc-eyebrow">FAQ</p>
                <h2>Common questions.</h2>
              </div>
              <div className="uc-faq-list">
                {FAQ_ITEMS.map(({ q, a }) => (
                  <div className="uc-faq-item" key={q}>
                    <h3>{q}</h3>
                    <p>{a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────── */}
        <section className="uc-cta">
          <p className="uc-cta-proof">Free to start · No installation</p>
          <h2>Start simulating ESP32 projects in Eesha Learn.</h2>
          <p>
            Open a project, add ESP32-S3, and simulate the first version before the parts arrive.
          </p>
          <div className="uc-cta-actions">
            <Link
              to="/editor"
              className="cta-primary"
              onClick={() => trackClickCTA('esp32-usecase-cta', '/editor')}
            >
              Start with ESP32-S3 <ArrowRight size={16} />
            </Link>
            <Link to="/docs/getting-started" className="cta-secondary">
              Read the docs
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
};
