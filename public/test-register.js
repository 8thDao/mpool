// Simple test to verify register button works
console.log("=== REGISTER BUTTON TEST ===");

// Test 1: Check if button exists
const btnRegister = document.getElementById('btn-register');
console.log("Register button found:", btnRegister !== null);

// Test 2: Check if inputs exist
const phoneInput = document.getElementById('reg-phone');
const usernameInput = document.getElementById('reg-username');
const passInput = document.getElementById('reg-pass');
console.log("Phone input found:", phoneInput !== null);
console.log("Username input found:", usernameInput !== null);
console.log("Password input found:", passInput !== null);

// Test 3: Try clicking the button
if (btnRegister) {
    console.log("Button innerHTML:", btnRegister.innerHTML);
    console.log("Button disabled:", btnRegister.disabled);

    // Add a test listener
    btnRegister.addEventListener('click', () => {
        console.log("TEST LISTENER: Register button was clicked!");
    });

    console.log("Test listener attached. Try clicking the register button now.");
} else {
    console.error("CRITICAL: Register button not found in DOM!");
}
