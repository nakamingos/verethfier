# 🚀 Supabase CLI Installation Guide

The Supabase CLI is required for automatic database management in tests. Here's how to install it:

## 📦 Installation Methods

### **macOS (Homebrew) - Recommended**
```bash
brew install supabase/tap/supabase
```

### **Linux (Direct Download) - Recommended**
```bash
# Download and install the latest release (.deb package)
curl -fsSL https://github.com/supabase/cli/releases/download/v2.30.4/supabase_2.30.4_linux_amd64.deb -o supabase.deb
sudo dpkg -i supabase.deb
rm supabase.deb
```

### **Linux (Binary Download) - Alternative**
```bash
# Download the binary directly
curl -fsSL https://github.com/supabase/cli/releases/download/v2.30.4/supabase_linux_amd64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/supabase
sudo chmod +x /usr/local/bin/supabase
```

### **Linux (Using Snap)**
```bash
# If you have snap installed
sudo snap install supabase
```

### **Windows (Scoop)**
```bash
# Install Scoop if you don't have it
# Then add Supabase bucket and install
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### **Direct Download (All Platforms)**
1. Go to: https://github.com/supabase/cli/releases
2. Download the appropriate binary for your platform
3. Add it to your PATH

### **Alternative: Docker (If you have Docker)**
```bash
# Use Supabase via Docker (no local install needed)
alias supabase="docker run --rm -it -v $(pwd):/app -w /app supabase/cli"
```

## ✅ Verify Installation

```bash
# Check if Supabase CLI is installed
supabase --version

# Should output something like: supabase version 1.x.x
```

## 🔧 After Installation

Once installed, you can run the database tests:

```bash
# The tests will now automatically start/stop Supabase
yarn test:db

# Or with npm
npm run test:db
```

## ⚠️ Important Notes

1. **Global npm/yarn install is NOT supported** - Supabase CLI must be installed via system package managers
2. **Docker is required** - Supabase CLI uses Docker to run the local database
3. **First run may be slow** - Supabase needs to download Docker images

## 🐛 Troubleshooting

### "Command not found: supabase"
- Make sure the CLI is properly installed and in your PATH
- Try restarting your terminal after installation

### "Docker not found"
- Install Docker Desktop (macOS/Windows) or Docker Engine (Linux)
- Make sure Docker is running before starting Supabase

### "Permission denied"
- Make sure your user can run Docker commands
- On Linux, add your user to the docker group: `sudo usermod -aG docker $USER`

## 🎯 Manual Alternative

If you can't install the CLI, you can still run tests manually:

```bash
# Set environment variable to skip auto-management
export MANUAL_SUPABASE=true

# Start your database however you prefer
# Then run tests
yarn test:db
```
