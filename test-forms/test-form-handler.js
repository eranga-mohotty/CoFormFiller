/**
 * Test Form Submit Handler
 * Prevents navigation and displays submission confirmation without inline event handlers (CSP compliant).
 */
document.addEventListener('DOMContentLoaded', () => {
  const forms = document.querySelectorAll('form');
  forms.forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Form submitted successfully!');
    });
  });
});
