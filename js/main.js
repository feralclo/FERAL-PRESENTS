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


  // ---- Hero Text: Scramble Reveal + Strobe Flash + Periodic Glitch ---- //
  var heroTextEl = document.getElementById('heroText');
  var heroFlash = document.getElementById('heroFlash');
  if (heroTextEl) {
    var lines = heroTextEl.querySelectorAll('.hero-glitch__line');
    var lineTexts = [];
    var scrambleChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*<>/\\|=-_';

    // Store final text for each line and blank them
    for (var li = 0; li < lines.length; li++) {
      lineTexts.push(lines[li].textContent);
      lines[li].textContent = '';
    }

    // Phase 1: Scramble reveal with strobe flash entrance
    function scrambleRevealLines() {
      var resolved = [];
      var frameCount = 0;

      for (var li = 0; li < lineTexts.length; li++) {
        resolved.push([]);
      }

      // Fire strobe flash
      if (heroFlash) {
        heroFlash.classList.add('hero-glitch__flash--active');
        setTimeout(function() {
          heroFlash.classList.remove('hero-glitch__flash--active');
        }, 700);
      }

      function tick() {
        var allDone = true;

        for (var li = 0; li < lines.length; li++) {
          var text = lineTexts[li];
          var output = '';
          var lineDone = true;

          for (var i = 0; i < text.length; i++) {
            if (resolved[li][i]) {
              output += text[i];
            } else if (text[i] === ' ') {
              resolved[li][i] = true;
              output += ' ';
            } else {
              lineDone = false;
              allDone = false;
              // Stagger: second line starts later
              var stagger = li * 12;
              if (frameCount > (i * 2) + 6 + stagger && Math.random() < 0.35) {
                resolved[li][i] = true;
                output += text[i];
              } else {
                output += scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
              }
            }
          }
          lines[li].textContent = output;
        }

        frameCount++;

        if (!allDone) {
          requestAnimationFrame(tick);
        } else {
          // Restore final text
          for (var li = 0; li < lines.length; li++) {
            lines[li].textContent = lineTexts[li];
          }
          startPeriodicGlitch();
        }
      }

      tick();
    }

    // Phase 2: Periodic aggressive glitch bursts
    function startPeriodicGlitch() {
      function doGlitch() {
        var burstCount = 0;
        var maxBursts = 4 + Math.floor(Math.random() * 5);
        heroTextEl.classList.add('hero-glitch--active');

        var burstInterval = setInterval(function() {
          if (burstCount >= maxBursts) {
            // Restore clean text
            for (var li = 0; li < lines.length; li++) {
              lines[li].textContent = lineTexts[li];
            }
            heroTextEl.classList.remove('hero-glitch--active');
            clearInterval(burstInterval);
            return;
          }

          // Corrupt characters in each line
          for (var li = 0; li < lines.length; li++) {
            var text = lineTexts[li];
            var glitched = '';
            for (var i = 0; i < text.length; i++) {
              if (Math.random() < 0.2) {
                glitched += scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
              } else {
                glitched += text[i];
              }
            }
            lines[li].textContent = glitched;
          }
          burstCount++;
        }, 50);
      }

      function scheduleNext() {
        var delay = 3000 + Math.random() * 5000;
        setTimeout(function() {
          doGlitch();
          scheduleNext();
        }, delay);
      }
      scheduleNext();
    }

    // Kick off after page load
    setTimeout(scrambleRevealLines, 600);
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


  // ---- Events Swipe Hint (hide after user scrolls) ---- //
  var eventsGrid = document.querySelector('.events__grid');
  var scrollHint = document.getElementById('eventsScrollHint');
  if (eventsGrid && scrollHint) {
    eventsGrid.addEventListener('scroll', function() {
      if (eventsGrid.scrollLeft > 30) {
        scrollHint.classList.add('events__scroll-hint--hidden');
      }
    }, { passive: true });
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


  // ---- About Section: JS-Driven Animations ---- //
  (function() {
    var scrambleChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&!';

    // Scramble-reveal a text element
    function scrambleReveal(el, finalText, duration, callback) {
      var startTime = Date.now();
      var len = finalText.length;
      el.style.opacity = '1';

      function tick() {
        var elapsed = Date.now() - startTime;
        var progress = Math.min(elapsed / duration, 1);
        var output = '';
        for (var i = 0; i < len; i++) {
          if (finalText[i] === ' ') {
            output += ' ';
          } else if (i / len < progress - 0.1) {
            output += finalText[i];
          } else if (i / len < progress + 0.3) {
            output += scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
          } else {
            output += scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
          }
        }
        el.textContent = output;
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          el.textContent = finalText;
          if (callback) callback();
        }
      }
      tick();
    }

    // Word-by-word reveal
    function wordReveal(el, delayStart) {
      var text = el.textContent.trim();
      var words = text.split(/\s+/);
      el.innerHTML = '';
      words.forEach(function(word, i) {
        var span = document.createElement('span');
        span.className = 'word';
        span.textContent = word;
        el.appendChild(span);
        // Add space after each word except last
        if (i < words.length - 1) {
          el.appendChild(document.createTextNode(' '));
        }
      });
      // Stagger reveal
      var wordEls = el.querySelectorAll('.word');
      wordEls.forEach(function(w, i) {
        setTimeout(function() {
          w.classList.add('visible');
        }, delayStart + i * 30);
      });
    }

    // Counter spin for index numbers
    function counterSpin(el, finalNum, duration) {
      var startTime = Date.now();
      function tick() {
        var elapsed = Date.now() - startTime;
        if (elapsed < duration) {
          el.textContent = '0' + Math.floor(Math.random() * 10);
          requestAnimationFrame(tick);
        } else {
          el.textContent = finalNum;
        }
      }
      tick();
    }

    // Observe each pillar
    var pillars = document.querySelectorAll('.about__pillar');
    if (pillars.length > 0) {
      var pillarObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting && !entry.target.dataset.animated) {
            entry.target.dataset.animated = 'true';
            entry.target.classList.add('revealed');

            var pillar = entry.target;
            var indexSpan = pillar.querySelector('.about__pillar-index span');
            var titleEl = pillar.querySelector('.about__pillar-title');
            var textEl = pillar.querySelector('.about__pillar-text');

            // 1. Counter spin the index number
            if (indexSpan) {
              var finalNum = indexSpan.textContent;
              counterSpin(indexSpan, finalNum, 400);
            }

            // 2. Scramble-reveal the title
            if (titleEl) {
              var finalTitle = titleEl.textContent;
              setTimeout(function() {
                scrambleReveal(titleEl, finalTitle, 600);
              }, 200);
            }

            // 3. Word-by-word reveal the body text
            if (textEl) {
              wordReveal(textEl, 500);
            }

            pillarObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });

      pillars.forEach(function(p) { pillarObserver.observe(p); });
    }

    // Closer: scramble reveal
    var closer = document.querySelector('.about__closer');
    var closerText = document.querySelector('.about__closer-text');
    if (closer && closerText) {
      var closerFinal = closerText.textContent;
      closerText.textContent = '';
      var closerObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting && !entry.target.dataset.animated) {
            entry.target.dataset.animated = 'true';
            entry.target.classList.add('revealed');
            setTimeout(function() {
              scrambleReveal(closerText, closerFinal, 800, function() {
                closerText.classList.add('anim-done');
              });
            }, 300);
            closerObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      closerObserver.observe(closer);
    }
  })();


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
        // Hero CTA scrolls a bit further into the events section
        const isHeroCta = anchor.classList.contains('hero__cta');
        const headerOffset = isHeroCta ? -60 : 24;
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
