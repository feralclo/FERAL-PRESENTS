/* ============================================
   FERAL PRESENTS — Interactive JavaScript
   ============================================ */

(function () {
  'use strict';

  // ---- Particle Grid Canvas (Hero) ---- //
  const heroCanvas = document.getElementById('heroCanvas');
  if (heroCanvas) {
    const ctx = heroCanvas.getContext('2d');
    let width, height;
    let mouse = { x: -1000, y: -1000 };
    let particles = [];
    let animationId;
    const GRID_SPACING = 40;
    const PARTICLE_BASE_SIZE = 1;
    const INTERACTION_RADIUS = 150;
    const RED = '#ff0033';

    function resize() {
      width = heroCanvas.width = heroCanvas.offsetWidth;
      height = heroCanvas.height = heroCanvas.offsetHeight;
      initParticles();
    }

    function initParticles() {
      particles = [];
      const cols = Math.ceil(width / GRID_SPACING) + 1;
      const rows = Math.ceil(height / GRID_SPACING) + 1;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          particles.push({
            baseX: i * GRID_SPACING,
            baseY: j * GRID_SPACING,
            x: i * GRID_SPACING,
            y: j * GRID_SPACING,
            size: PARTICLE_BASE_SIZE,
            alpha: 0.15 + Math.random() * 0.1,
            baseAlpha: 0.15 + Math.random() * 0.1,
          });
        }
      }
    }

    function drawParticles() {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = mouse.x - p.baseX;
        const dy = mouse.y - p.baseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < INTERACTION_RADIUS) {
          const force = (INTERACTION_RADIUS - dist) / INTERACTION_RADIUS;
          const angle = Math.atan2(dy, dx);
          const pushX = Math.cos(angle) * force * 20;
          const pushY = Math.sin(angle) * force * 20;

          p.x += (p.baseX - pushX - p.x) * 0.15;
          p.y += (p.baseY - pushY - p.y) * 0.15;
          p.size += (PARTICLE_BASE_SIZE + force * 2.5 - p.size) * 0.15;
          p.alpha += (Math.min(1, p.baseAlpha + force * 0.8) - p.alpha) * 0.15;

          // Draw connections to nearby affected particles
          for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const dx2 = mouse.x - p2.baseX;
            const dy2 = mouse.y - p2.baseY;
            const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

            if (dist2 < INTERACTION_RADIUS) {
              const px = p.x - p2.x;
              const py = p.y - p2.y;
              const pDist = Math.sqrt(px * px + py * py);

              if (pDist < GRID_SPACING * 1.8) {
                const lineAlpha = (1 - pDist / (GRID_SPACING * 1.8)) * force * 0.3;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = `rgba(255, 0, 51, ${lineAlpha})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
              }
            }
          }
        } else {
          p.x += (p.baseX - p.x) * 0.08;
          p.y += (p.baseY - p.y) * 0.08;
          p.size += (PARTICLE_BASE_SIZE - p.size) * 0.08;
          p.alpha += (p.baseAlpha - p.alpha) * 0.08;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.fill();
      }
    }

    function animate() {
      drawParticles();
      animationId = requestAnimationFrame(animate);
    }

    heroCanvas.addEventListener('mousemove', function (e) {
      const rect = heroCanvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });

    heroCanvas.addEventListener('mouseleave', function () {
      mouse.x = -1000;
      mouse.y = -1000;
    });

    // Touch support
    heroCanvas.addEventListener('touchmove', function (e) {
      const rect = heroCanvas.getBoundingClientRect();
      mouse.x = e.touches[0].clientX - rect.left;
      mouse.y = e.touches[0].clientY - rect.top;
    }, { passive: true });

    heroCanvas.addEventListener('touchend', function () {
      mouse.x = -1000;
      mouse.y = -1000;
    });

    window.addEventListener('resize', resize);
    resize();
    animate();

    // Mouse red glow tracker
    const mouseTracker = document.getElementById('mouseTracker');
    if (mouseTracker) {
      document.querySelector('.hero').addEventListener('mousemove', function (e) {
        mouseTracker.style.left = e.clientX + 'px';
        mouseTracker.style.top = e.clientY + 'px';
        mouseTracker.style.opacity = '0.5';
      });

      document.querySelector('.hero').addEventListener('mouseleave', function () {
        mouseTracker.style.opacity = '0';
      });
    }
  }


  // ---- Typewriter Effect with Glitch ---- //
  const typewriterEl = document.getElementById('typewriter');
  if (typewriterEl) {
    const phrases = [
      'UNDERGROUND EVENTS COLLECTIVE',
      'NO SIGNAL. NO RULES.',
      'SYSTEM OVERRIDE IN PROGRESS',
      'ENTER THE FREQUENCY',
      'RAW. UNFILTERED. FERAL.',
    ];
    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let typeSpeed = 80;
    var glitchChars = '!@#$%^&*()_+{}|:<>?/\\=-';

    function triggerGlitch() {
      var original = typewriterEl.textContent;
      var glitchCount = 0;
      var maxGlitches = 4;
      var glitchInterval = setInterval(function() {
        if (glitchCount >= maxGlitches) {
          typewriterEl.textContent = original;
          clearInterval(glitchInterval);
          return;
        }
        var glitched = '';
        for (var i = 0; i < original.length; i++) {
          if (Math.random() < 0.3) {
            glitched += glitchChars[Math.floor(Math.random() * glitchChars.length)];
          } else {
            glitched += original[i];
          }
        }
        typewriterEl.textContent = glitched;
        glitchCount++;
      }, 60);
    }

    function type() {
      var currentPhrase = phrases[phraseIndex];

      if (isDeleting) {
        typewriterEl.textContent = currentPhrase.substring(0, charIndex - 1);
        charIndex--;
        typeSpeed = 30;
      } else {
        typewriterEl.textContent = currentPhrase.substring(0, charIndex + 1);
        charIndex++;
        typeSpeed = 70;
      }

      if (!isDeleting && charIndex === currentPhrase.length) {
        triggerGlitch();
        typeSpeed = 2800;
        isDeleting = true;
      } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        typeSpeed = 500;
      }

      setTimeout(type, typeSpeed);
    }

    setTimeout(type, 1200);
  }


  // ---- Header Scroll Behavior ---- //
  const header = document.getElementById('header');
  if (header) {
    let lastScroll = 0;
    let ticking = false;

    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          const currentScroll = window.scrollY;

          if (currentScroll > 100) {
            if (currentScroll > lastScroll && currentScroll > 300) {
              header.classList.add('header--hidden');
            } else {
              header.classList.remove('header--hidden');
            }
          } else {
            header.classList.remove('header--hidden');
          }

          lastScroll = currentScroll;
          ticking = false;
        });
        ticking = true;
      }
    });
  }


  // ---- Mobile Navigation ---- //
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function () {
      navToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
      document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });

    // Close on link click
    navMenu.querySelectorAll('.nav__link, .nav__cta').forEach(function (link) {
      link.addEventListener('click', function () {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }


  // ---- Scroll Reveal ---- //
  const revealElements = document.querySelectorAll('[data-reveal]');
  if (revealElements.length > 0) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -60px 0px',
    });

    revealElements.forEach(function (el) {
      observer.observe(el);
    });
  }


  // ---- ASCII Art Generator ---- //
  const asciiArt = document.getElementById('asciiArt');
  if (asciiArt) {
    const chars = ['/', '\\', '|', '-', '+', '.', ':', '#', '@', '*', '0', '1'];
    const cols = 40;
    const rows = 20;
    let grid = [];

    function initGrid() {
      grid = [];
      for (let y = 0; y < rows; y++) {
        let row = '';
        for (let x = 0; x < cols; x++) {
          row += Math.random() > 0.7
            ? chars[Math.floor(Math.random() * chars.length)]
            : ' ';
        }
        grid.push(row);
      }
    }

    function renderGrid() {
      asciiArt.textContent = grid.join('\n');
    }

    function mutateGrid() {
      const y = Math.floor(Math.random() * rows);
      const x = Math.floor(Math.random() * cols);
      const row = grid[y].split('');
      row[x] = Math.random() > 0.5
        ? chars[Math.floor(Math.random() * chars.length)]
        : ' ';
      grid[y] = row.join('');
      renderGrid();
    }

    initGrid();
    renderGrid();
    setInterval(mutateGrid, 100);
  }


  // ---- Newsletter Form (Klaviyo Integration) ---- //
  const signupForm = document.getElementById('signupForm');
  const formStatus = document.getElementById('formStatus');
  if (signupForm && formStatus) {
    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const input = signupForm.querySelector('.contact__input');
      if (input && input.value) {
        const email = input.value;

        // Klaviyo settings
        const listId = 'SnE86f';
        const companyId = 'Y8FS6L';

        formStatus.textContent = '> TRANSMITTING...';
        formStatus.className = 'contact__status';

        // Use Klaviyo's client-side subscribe endpoint
        var formData = new FormData();
        formData.append('g', listId);
        formData.append('email', email);

        fetch('https://manage.kmail-lists.com/ajax/subscriptions/subscribe', {
          method: 'POST',
          body: formData
        })
        .then(function(response) {
          return response.json();
        })
        .then(function(data) {
          if (data.success || data.data && data.data.is_subscribed) {
            formStatus.textContent = '> TRANSMISSION RECEIVED. STAND BY.';
            formStatus.className = 'contact__status contact__status--success';
            input.value = '';
          } else {
            formStatus.textContent = '> TRANSMISSION RECEIVED. STAND BY.';
            formStatus.className = 'contact__status contact__status--success';
            input.value = '';
          }
        })
        .catch(function() {
          formStatus.textContent = '> CONNECTION FAILED. TRY AGAIN.';
          formStatus.className = 'contact__status';
        })
        .finally(function() {
          setTimeout(function () {
            formStatus.textContent = '';
            formStatus.className = 'contact__status';
          }, 4000);
        });
      }
    });
  }


  // ---- Smooth Scroll for Anchor Links ---- //
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const headerOffset = 24;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
      }
    });
  });


  // ---- Page Transition Effect ---- //
  document.querySelectorAll('a:not([href^="#"])').forEach(function (link) {
    if (link.hostname === window.location.hostname) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        const href = this.getAttribute('href');
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.3s ease';
        setTimeout(function () {
          window.location.href = href;
        }, 300);
      });
    }
  });

  // Fade in on load
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.4s ease';
  requestAnimationFrame(function () {
    document.body.style.opacity = '1';
  });

  // Fix for back button black screen (bfcache restoration)
  window.addEventListener('pageshow', function(event) {
    // Always ensure body is visible when page is shown (including from bfcache)
    document.body.style.opacity = '1';
  });

})();
