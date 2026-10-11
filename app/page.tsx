import {
  ArrowRight,
  Activity,
  Clock3,
  ShieldCheck,
  Users,
  MoveUpRight,
  Plus,
} from "lucide-react";
export default function Home() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Plus />
          </span>
          CareFlow<span className="brand-sub">PATIENT FLOW, REIMAGINED</span>
        </a>
        <div className="nav-links">
          <a href="#experience">The experience</a>
          <a href="/display">Queue display</a>
          <a className="btn ghost" href="/login">
            Sign in <ArrowRight size={16} />
          </a>
        </div>
      </nav>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="live-dot" /> LESS WAITING. MORE CARING.
            </span>
            <h1>
              A calmer journey
              <br />
              from check-in
              <br />
              to <em>care.</em>
            </h1>
            <p>
              One connected workspace for patients, care teams, and hospital
              operations. Bring clarity to every turn in the queue.
            </p>
            <div className="hero-actions">
              <a className="btn primary" href="/workspace?demo=1">
                Explore the live demo <ArrowRight size={18} />
              </a>
              <a className="text-link" href="/login">
                Open your workspace <MoveUpRight size={15} />
              </a>
            </div>
            <div className="hero-note">
              <ShieldCheck size={17} /> Educational prototype · Synthetic demo
              data
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-top">
              <span>
                <Activity size={17} /> CARE IN MOTION
              </span>
              <span className="badge green">Demo preview</span>
            </div>
            <div className="journey-line">
              <span className="step-icon">01</span>
              <div>
                <small>YOUR JOURNEY</small>
                <h3>Every step, in view.</h3>
              </div>
            </div>
            <div className="token-preview">
              <div>
                <span className="eyebrow">GENERAL MEDICINE</span>
                <h2>G–024</h2>
                <p>Your place. Your peace of mind.</p>
              </div>
              <div className="token-symbol">
                <Plus size={54} />
              </div>
            </div>
            <div className="progress-track">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="journey-labels">
              <span>Booked</span>
              <span>Checked in</span>
              <span>Reviewed</span>
              <span>With doctor</span>
            </div>
            <div className="visual-bottom">
              <div className="avatar-stack">
                <span>MS</span>
                <span>AN</span>
                <span>KR</span>
              </div>
              <div>
                <strong>Connected care teams</strong>
                <small>One shared view of what happens next</small>
              </div>
              <span className="arrow-circle">
                <ArrowRight />
              </span>
            </div>
          </div>
        </section>
        <section id="experience" className="feature-strip">
          <article>
            <Clock3 />
            <h3>Know what to expect</h3>
            <p>Clear queue positions and explained waiting-time estimates.</p>
          </article>
          <article>
            <Users />
            <h3>Keep your team in sync</h3>
            <p>From reception to consultation, every handoff has a place.</p>
          </article>
          <article>
            <ShieldCheck />
            <h3>Give each role the right view</h3>
            <p>Private patient records and clinician-reviewed priority.</p>
          </article>
        </section>
        <section className="landing-footer">
          <strong>Designed for a better patient experience.</strong>
          <span>Original college project · CareFlow</span>
        </section>
      </main>
    </div>
  );
}
