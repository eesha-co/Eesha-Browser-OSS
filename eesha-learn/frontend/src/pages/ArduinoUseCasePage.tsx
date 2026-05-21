/**
 * /arduino-simulator — Arduino Use-Case Page
 * Modeled after Cirkit Designer's arduino-simulator.html, rebranded for Eesha Learn.
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
  Thermometer,
  Lock,
  Gamepad2,
  Clock,
  Bot,
  MonitorSpeaker,
  CircuitBoard,
} from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import { useSEO } from '../utils/useSEO';
import { trackClickCTA } from '../utils/analytics';
import './ArduinoUseCasePage.css';

/* ── SEO metadata ─────────────────────────────────────── */
const SEO_META = {
  title: 'Arduino Simulator Online — Design & Simulate Arduino Projects | Eesha Learn',
  description:
    'Simulate Arduino projects in your browser. Design circuits, run Arduino sketches, test components, use AI help, and export diagrams. Free and open-source.',
  url: 'https://eesha-learn.dev/arduino-simulator',
};

const FAQ_ITEMS = [
  {
    q: 'What can I do with Eesha Learn\'s Arduino simulator?',
    a: 'Build Arduino circuits, write sketches, and run simulations directly in the browser — with real AVR8 emulation at 16 MHz and 48+ interactive components.',
  },
  {
    q: 'Is Eesha Learn free to start?',
    a: 'Eesha Learn is completely free and open-source. No account, no payment, no cloud subscription. Run it in your browser or self-host with Docker.',
  },
  {
    q: 'Which Arduino boards does Eesha Learn support?',
    a: 'Eesha Learn supports Arduino Uno (ATmega328P), Arduino Nano, Arduino Mega 2560, and ATtiny85 — along with common sensors, displays, motors, buttons, and connected modules.',
  },
  {
    q: 'Can Eesha Learn AI help with Arduino projects?',
    a: 'Eesha Learn\'s AI assistant can help with wiring, code generation, circuit questions, and troubleshooting issues as you design and simulate.',
  },
  {
    q: 'Can I build the real circuit after simulation?',
    a: 'Yes. Use the simulated project as a build reference, then export the wiring diagram, share the project, or upload firmware to supported hardware when you are ready.',
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
        name: 'Arduino Simulator',
        item: 'https://eesha-learn.dev/arduino-simulator',
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
const BOARD_STARTERS = [
  {
    name: 'Arduino Uno',
    description: 'The default board for LEDs, buttons, sensors, displays, and classroom labs.',
    badge: 'Most popular',
    badgeVariant: 'primary' as const,
    icon: Cpu,
    link: '/editor',
  },
  {
    name: 'Arduino Mega',
    description: 'A better fit for larger layouts, multiple modules, motors, and display-heavy projects.',
    badge: 'More I/O',
    badgeVariant: 'secondary' as const,
    icon: CircuitBoard,
    link: '/editor',
  },
  {
    name: 'ATtiny85',
    description: 'Tiny 8-pin AVR for minimal projects — perfect for learning embedded programming.',
    badge: 'Compact',
    badgeVariant: 'secondary' as const,
    icon: Zap,
    link: '/editor',
  },
];

const PROJECT_GALLERY = [
  {
    title: 'Pong game with OLED',
    description: 'Run game logic on an Arduino Uno with OLED output and pushbutton paddle controls.',
    icon: Gamepad2,
    link: '/examples',
  },
  {
    title: 'Hotel safe',
    description: 'Combine keypad input, LCD messages, and servo movement into a simulated lock project.',
    icon: Lock,
    link: '/examples',
  },
  {
    title: 'DHT11 sensor + LCD',
    description: 'Read temperature and humidity from a DHT11 sensor and display live values on a 16×2 LCD.',
    icon: Thermometer,
    link: '/examples',
  },
  {
    title: 'Bot with L298N driver',
    description: 'Control two DC motors through an L298N driver using joystick input and Arduino logic.',
    icon: Bot,
    link: '/examples',
  },
  {
    title: 'DS1307 clock + LCD',
    description: 'Use a real-time clock module with an Arduino Uno and print date/time to an LCD.',
    icon: Clock,
    link: '/examples',
  },
  {
    title: 'TFT display demo',
    description: 'Drive an ILI9341 TFT display with Arduino — text, shapes, and bitmap graphics.',
    icon: MonitorSpeaker,
    link: '/examples',
  },
];

/* ── Component ────────────────────────────────────────── */
export const ArduinoUseCasePage: React.FC = () => {
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
              <span>Arduino Simulator</span>
            </nav>
            <p className="uc-eyebrow">Online Arduino Simulator</p>
            <h1>
              Design and simulate Arduino projects{' '}
              <span className="uc-accent">in your browser.</span>
            </h1>
            <p className="uc-hero-lede">
              Use Eesha Learn AI to help with wiring and code, then test the circuit in simulation
              before you build it.
            </p>
            <div className="uc-hero-actions">
              <Link
                to="/editor"
                className="cta-primary"
                onClick={() => trackClickCTA('arduino-usecase', '/editor')}
              >
                Start with Arduino Uno <ArrowRight size={16} />
              </Link>
              <Link to="#examples" className="cta-secondary">
                View projects
              </Link>
            </div>
          </div>
          <div className="uc-hero-visual" role="img" aria-label="Arduino simulation preview">
            <div className="uc-hero-visual-icon">
              <CircuitBoard size={120} />
            </div>
          </div>
        </section>

        {/* ── Start from a board ────────────────────────── */}
        <section className="uc-section">
          <div className="uc-section-header">
            <p className="uc-eyebrow">Start from a board</p>
            <h2>Start from an Arduino board.</h2>
            <p>Pick a board, add parts, and simulate the circuit as you build.</p>
          </div>
          <div className="uc-starter-grid">
            {BOARD_STARTERS.map((board) => {
              const Icon = board.icon;
              return (
                <Link
                  key={board.name}
                  to={board.link}
                  className={`uc-starter-card${board.badgeVariant === 'primary' ? ' uc-starter-featured' : ''}`}
                  onClick={() => trackClickCTA('arduino-usecase-starter', board.link)}
                >
                  <span
                    className={`uc-starter-badge${board.badgeVariant === 'secondary' ? ' uc-starter-badge-secondary' : ''}`}
                  >
                    {board.badge}
                  </span>
                  <div className="uc-starter-board-icon">
                    <Icon size={24} />
                  </div>
                  <div>
                    <h3>{board.name}</h3>
                    <p>{board.description}</p>
                  </div>
                  <span className="uc-starter-cta">
                    Start with {board.name.replace('Arduino ', '')}{' '}
                    <ChevronRight size={14} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Project gallery ───────────────────────────── */}
        <section className="uc-section-alt" id="examples">
          <div className="uc-section-inner">
            <div className="uc-section-header">
              <p className="uc-eyebrow">Arduino project gallery</p>
              <h2>Explore real Arduino projects.</h2>
              <p>
                Open real Arduino projects, inspect the wiring, run the simulation, and adapt them
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
                    onClick={() => trackClickCTA('arduino-usecase-gallery', project.link)}
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

        {/* ── Why Eesha Learn ───────────────────────────── */}
        <section className="uc-section">
          <div className="uc-section-header">
            <p className="uc-eyebrow">Why Eesha Learn</p>
            <h2>Design with AI. Test in simulation. Build when ready.</h2>
            <p>
              Use Eesha Learn AI to help wire your Arduino project, generate code, and troubleshoot
              as you build. Then run the simulation in the browser and export diagrams, share the
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
                Ask Eesha Learn for help wiring parts, generating code, and debugging your Arduino
                project as you build.
              </p>
            </div>
            <div className="uc-compare-card uc-compare-featured">
              <div className="uc-compare-icon">
                <Play size={22} />
              </div>
              <h3>Simulate the connected project</h3>
              <p>
                Run the sketch while sensors, displays, motors, buttons, and LEDs respond in the
                same workspace.
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
          <h2>Start simulating Arduino projects in Eesha Learn.</h2>
          <p>
            Open a project, add an Arduino, and simulate the first version before the parts arrive.
          </p>
          <div className="uc-cta-actions">
            <Link
              to="/editor"
              className="cta-primary"
              onClick={() => trackClickCTA('arduino-usecase-cta', '/editor')}
            >
              Start with Arduino Uno <ArrowRight size={16} />
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
