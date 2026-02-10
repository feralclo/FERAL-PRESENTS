export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__inner">
          <span className="footer__copy">
            &copy; {new Date().getFullYear()} FERAL PRESENTS. ALL RIGHTS RESERVED.
          </span>
          <span className="footer__status">
            STATUS: <span className="text-red">ONLINE</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
