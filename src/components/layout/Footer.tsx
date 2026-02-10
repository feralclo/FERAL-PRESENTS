import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/FERAL LOGO.svg"
              alt="FERAL PRESENTS"
              className="footer__logo"
            />
          </Link>
        </div>

        <div className="footer__links">
          <Link href="/#events">Events</Link>
          <Link href="/#about">About</Link>
          <Link href="/#contact">Contact</Link>
        </div>

        <div className="footer__copy">
          <p>&copy; {new Date().getFullYear()} FERAL PRESENTS. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
