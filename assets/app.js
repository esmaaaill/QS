const ready = (fn) => document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn);

// ---------- API + auth helpers ----------
// We now use the Supabase Client directly for Auth and generic requests.

let supabase;

try {
  // The Supabase JS v2 CDN exposes a global 'supabase' object with createClient
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
  console.error("Supabase client failed to initialize. Check config.js");
}

const authStore = {
  // We can rely on supabase.auth.session() or keep a local signal
  get session() {
    return supabase?.auth.session(); // v1 style, but v2 uses getSession
  }
};

// Display feedback inside a target element with a consistent style.
const setStatus = (el, message, isError = false) => {
  if (!el) return;
  el.textContent = message;
  el.className = `form-status ${isError ? 'error' : 'success'}`;
};

// Wrapper specifically for Edge Functions
const invokeFunction = async (functionName, payload) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) throw new Error("Please log in first.");

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload,
    headers: { Authorization: `Bearer ${token}` } // Supabase client handles this usually, but explicit is safe
  });

  if (error) {
    // Edge function might return error object
    throw new Error(error.message || "Function error");
  }
  return data;
};

const initSearchForm = () => {
  const form = document.querySelector('#searchForm');
  const output = document.querySelector('#searchResults');
  if (!form || !output) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const destination = form.location.value.trim();
    const guests = form.guests.value;
    const checkIn = form.checkin.value;
    const checkOut = form.checkout.value;

    if (!destination || !guests || !checkIn || !checkOut) {
      output.textContent = 'Please fill in all fields to start your search.';
      output.className = 'error';
      return;
    }

    if (new Date(checkOut) <= new Date(checkIn)) {
      output.textContent = 'Check-out date must be after check-in.';
      output.className = 'error';
      return;
    }

    output.textContent = `Searching stays in ${destination}...`;
    output.className = 'success search-results';

    // Call Endpoints? For now, public search via client DB allowed.
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*, hotels!inner(city, name)')
      .ilike('hotels.city', `%${destination}%`)
      .gte('capacity', guests);

    if (error) {
      output.textContent = "Error searching rooms.";
      output.className = "error";
    } else if (rooms.length === 0) {
      output.textContent = "No rooms found matching your criteria.";
    } else {
      // Render simple list
      output.innerHTML = rooms.map(r => `
            <div class="card hotel-card" style="margin-top:10px; flex-direction:row;">
                <div style="padding:10px;"><strong>${r.name}</strong> (${r.hotels.name})<br>${r.price_per_night} ${r.currency}/night</div>
                <div style="padding:10px; margin-left:auto;"><a class="btn btn-primary" href="booking.html?room=${r.id}">Book</a></div>
            </div>
        `).join('');
    }
  });
};

const initCarousel = () => {
  const carousel = document.querySelector('.carousel');
  if (!carousel) return;
  const images = Array.from(carousel.querySelectorAll('[data-slide]'));
  const next = carousel.querySelector('.next');
  const prev = carousel.querySelector('.prev');
  let index = 0;

  const update = () => {
    images.forEach((img, i) => {
      img.style.display = i === index ? 'block' : 'none';
    });
  };

  next?.addEventListener('click', () => {
    index = (index + 1) % images.length;
    update();
  });

  prev?.addEventListener('click', () => {
    index = (index - 1 + images.length) % images.length;
    update();
  });

  update();
};

const initBookingForm = () => {
  const form = document.querySelector('#bookingForm');
  const summary = document.querySelector('#bookingSummary');
  if (!form || !summary) return;

  // Pre-fill from URL
  const params = new URLSearchParams(window.location.search);
  if (params.has('room')) {
    const input = form.querySelector('[name="room"]'); // assuming user types, or we hidden input
    // This form is generic in existing HTML. We'll assume user enters details or we enhance it.
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errors = [];

    // Basic validation
    if (!data.checkin || !data.checkout) errors.push('Check-in and check-out are required.');

    // We expect room_id to be set (maybe via 'room' select or hidden). 
    // For demo, let's assume 'room' field is the ID or we map it.
    // The existing form has a 'room' input/select.

    if (errors.length) {
      summary.innerHTML = `<p class="error">${errors.join(' ')}</p>`;
      return;
    }

    setStatus(summary, 'Processing reservation...', false);

    try {
      // 1. Create Booking
      const booking = await invokeFunction('bookings', {
        room_id: "replace-with-real-uuid-if-testing", // User needs to select a real room
        check_in: data.checkin,
        check_out: data.checkout
      });

      // 2. Initiate Payment
      const payment = await invokeFunction('paymob-initiate', {
        booking_id: booking.id
      });

      summary.innerHTML = `
            <p class="success">Booking Created! Redirecting to payment...</p>
            <iframe src="${payment.iframe_url}" style="width:100%; height:600px; border:none;"></iframe>
        `;

    } catch (err) {
      summary.innerHTML = `<p class="error">${err.message}</p>`;
    }
  });
};

// Enable sign up, login via Supabase
const initAuthFlows = () => {
  const signupForm = document.querySelector('#signupForm');
  const loginForm = document.querySelector('#loginForm');
  const signupStatus = document.querySelector('#signupStatus');
  const loginStatus = document.querySelector('#loginStatus');
  const authStatus = document.querySelector('#authStatus');
  const profileDetails = document.querySelector('#profileDetails');
  const logoutBtn = document.querySelector('#logoutBtn');

  // Simple local storage for demo
  const getLocalUser = () => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch { return null; }
  };

  const renderProfile = () => {
    const user = getLocalUser();
    if (!user) {
      if (profileDetails) profileDetails.innerHTML = '';
      if (authStatus) authStatus.textContent = 'No account connected yet.';
      if (logoutBtn) logoutBtn.style.display = 'none';
      return;
    }
    if (authStatus) authStatus.textContent = `Signed in as ${user.email}`;
    if (profileDetails) profileDetails.innerHTML = `
      <div class="summary-row"><span>Email</span><strong>${user.email}</strong></div>
      <div class="summary-row"><span>Name</span><strong>${user.name}</strong></div>
    `;
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
  };

  renderProfile();

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(signupStatus, 'Creating account...');
    const { email, password, name } = Object.fromEntries(new FormData(signupForm));

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });
      const data = await res.json();

      if (res.ok) {
        setStatus(signupStatus, 'Account created! Please login.', false);
        signupForm.reset();
      } else {
        setStatus(signupStatus, data.message || 'Error creating account', true);
      }
    } catch (err) {
      setStatus(signupStatus, 'Connection error. Ensure server is running.', true);
    }
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(loginStatus, 'Signing in...');
    const { email, password } = Object.fromEntries(new FormData(loginForm));

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setStatus(loginStatus, 'Login successful!', false);
        loginForm.reset();
        renderProfile();
      } else {
        setStatus(loginStatus, data.message || 'Login failed', true);
      }
    } catch (err) {
      setStatus(loginStatus, 'Connection error. Ensure server is running.', true);
    }
  });

  logoutBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setStatus(loginStatus, 'Logged out.', false);
    renderProfile();
  });
};

const initMobileMenu = () => {
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.nav-links');

  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen);
  });
};

const initReveal = () => {
  // Reveal logic...
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('revealed');
    })
  });
  document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
};

ready(() => {
  initSearchForm();
  initCarousel();
  initBookingForm();
  initAuthFlows();
  initMobileMenu();
  initReveal();
});
