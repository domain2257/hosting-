
import { auth, database, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, ref, set, get, child, remove } from './firebase-config.js';

let currentUser = null;
let currentDomain = null;

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
    });
    document.getElementById(sectionId).classList.remove('hidden');
}

function showHome() {
    showSection('homeSection');
}

function showRegister() {
    showSection('registerSection');
}

function showLogin() {
    showSection('loginSection');
}

function showDashboard() {
    showSection('dashboardSection');
    checkUserDomain();
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

function updateNavigation() {
    const navLinks = document.getElementById('navLinks');
    if (currentUser) {
        navLinks.innerHTML = `
            <span style="color: #667eea; margin-right: 1rem; font-weight: 500;">${currentUser.email}</span>
            <button onclick="showDashboard()" class="nav-btn">Dashboard</button>
            <button onclick="logout()" class="nav-btn">Logout</button>
        `;
    } else {
        navLinks.innerHTML = `
            <button onclick="showLogin()" class="nav-btn">Login</button>
            <button onclick="showRegister()" class="nav-btn primary">Sign Up</button>
        `;
    }
}

// Firebase Registration
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        showNotification('Registration successful! Please login now', 'success');
        setTimeout(() => showLogin(), 1500);
    } catch (error) {
        showNotification(error.message || 'Registration failed', 'error');
    }
});

// Firebase Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        currentUser = { email: userCredential.user.email, uid: userCredential.user.uid };
        updateNavigation();
        showNotification('Login successful!', 'success');
        setTimeout(() => showDashboard(), 1000);
    } catch (error) {
        showNotification(error.message || 'Login failed', 'error');
    }
});

async function checkUserDomain() {
    if (!currentUser) return;
    
    try {
        const dbRef = ref(database);
        const snapshot = await get(child(dbRef, `domains/${currentUser.uid}`));
        
        if (snapshot.exists()) {
            const domainData = snapshot.val();
            currentDomain = domainData.subdomain;
            const extension = domainData.extension || '.com';
            document.getElementById('domainClaim').style.display = 'none';
            document.getElementById('domainInfo').style.display = 'block';
            document.getElementById('userSubdomain').textContent = currentDomain + extension;
            document.getElementById('domainLink').href = '/' + currentDomain;
            document.getElementById('uploadSection').style.display = 'block';
            loadFiles();
        } else {
            document.getElementById('domainClaim').style.display = 'block';
            document.getElementById('domainInfo').style.display = 'none';
            document.getElementById('uploadSection').style.display = 'none';
        }
    } catch (error) {
        console.error(error);
    }
}

async function checkSubdomain() {
    const subdomain = document.getElementById('subdomainInput').value.trim().toLowerCase();
    const extension = document.getElementById('extensionSelect').value;
    
    if (!subdomain) {
        showNotification('Please enter a domain name', 'error');
        return;
    }
    
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
        showNotification('Only lowercase letters, numbers and hyphens allowed', 'error');
        return;
    }
    
    try {
        const dbRef = ref(database);
        const snapshot = await get(child(dbRef, `subdomains/${subdomain}`));
        
        const statusDiv = document.getElementById('subdomainStatus');
        const claimBtn = document.getElementById('claimBtn');
        
        if (!snapshot.exists()) {
            statusDiv.innerHTML = `<i class="fas fa-check-circle"></i> <strong>${subdomain}${extension}</strong> is available!`;
            statusDiv.className = 'available';
            claimBtn.style.display = 'block';
        } else {
            statusDiv.innerHTML = `<i class="fas fa-times-circle"></i> <strong>${subdomain}${extension}</strong> is already taken`;
            statusDiv.className = 'unavailable';
            claimBtn.style.display = 'none';
        }
    } catch (error) {
        showNotification('Error checking domain', 'error');
    }
}

async function claimSubdomain() {
    const subdomain = document.getElementById('subdomainInput').value.trim().toLowerCase();
    const extension = document.getElementById('extensionSelect').value;
    
    if (!currentUser) {
        showNotification('Please login first', 'error');
        return;
    }
    
    try {
        // Check if subdomain is available
        const dbRef = ref(database);
        const snapshot = await get(child(dbRef, `subdomains/${subdomain}`));
        
        if (snapshot.exists()) {
            showNotification('Domain already taken', 'error');
            return;
        }
        
        // Claim the domain
        await set(ref(database, `domains/${currentUser.uid}`), {
            subdomain: subdomain,
            extension: extension,
            createdAt: new Date().toISOString()
        });
        
        await set(ref(database, `subdomains/${subdomain}`), {
            uid: currentUser.uid,
            extension: extension
        });
        
        showNotification('Domain claimed successfully!', 'success');
        checkUserDomain();
    } catch (error) {
        showNotification(error.message || 'Failed to claim domain', 'error');
    }
}

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fileInput = document.getElementById('fileInput');
    const files = fileInput.files;
    
    if (files.length === 0) {
        showNotification('Please select files', 'error');
        return;
    }
    
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    formData.append('subdomain', currentDomain);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`${data.count} file(s) uploaded successfully!`, 'success');
            fileInput.value = '';
            loadFiles();
        } else {
            showNotification(data.error || 'Upload failed', 'error');
        }
    } catch (err) {
        showNotification('An error occurred', 'error');
    }
});

async function loadFiles() {
    if (!currentUser || !currentDomain) return;
    
    try {
        const dbRef = ref(database);
        const snapshot = await get(child(dbRef, `files/${currentUser.uid}`));
        
        const filesList = document.getElementById('filesList');
        
        if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
            filesList.innerHTML = '<p style="color: #666; text-align: center; padding: 2rem;">No files uploaded yet</p>';
        } else {
            const files = snapshot.val();
            filesList.innerHTML = Object.keys(files).map(filename => `
                <div class="file-item">
                    <span><i class="fas fa-file"></i> ${filename}</span>
                    <button onclick="deleteFile('${filename}')"><i class="fas fa-trash"></i> Delete</button>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteFile(filename) {
    if (!confirm(`Delete ${filename}?`)) {
        return;
    }
    
    try {
        await remove(ref(database, `files/${currentUser.uid}/${filename}`));
        
        const response = await fetch(`/api/files/${currentDomain}/${filename}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('File deleted successfully', 'success');
            loadFiles();
        } else {
            showNotification('Delete failed', 'error');
        }
    } catch (err) {
        showNotification('An error occurred', 'error');
    }
}

async function logout() {
    try {
        await signOut(auth);
        currentUser = null;
        currentDomain = null;
        updateNavigation();
        showHome();
        showNotification('Logged out successfully', 'success');
    } catch (error) {
        showNotification('Logout failed', 'error');
    }
}

// Make functions globally available
window.showLogin = showLogin;
window.showRegister = showRegister;
window.showDashboard = showDashboard;
window.logout = logout;
window.checkSubdomain = checkSubdomain;
window.claimSubdomain = claimSubdomain;
window.deleteFile = deleteFile;

updateNavigation();
