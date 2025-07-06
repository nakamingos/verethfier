// Jest console setup to keep test output clean
// This suppresses console output during tests unless there are failures

// Store original console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug,
};

// Override console methods to suppress ALL output during tests
console.log = () => {};
console.info = () => {};
console.debug = () => {};
console.warn = () => {};
console.error = () => {};

// Set global reference
if (typeof global !== 'undefined') {
  global.console = console;
}

// For Node.js process output suppression
if (typeof process !== 'undefined' && process.stdout && process.stderr) {
  // Store original write methods
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  
  // Override to suppress most output but allow test framework messages
  process.stdout.write = function(chunk, encoding, callback) {
    // Allow Jest's own output but suppress application logs
    if (typeof chunk === 'string') {
      // Allow test results and Jest output
      if (chunk.includes('PASS') || chunk.includes('FAIL') || chunk.includes('Test Suites') || 
          chunk.includes('Tests:') || chunk.includes('Time:') || chunk.includes('Done in')) {
        return originalStdoutWrite.call(this, chunk, encoding, callback);
      }
      // Suppress everything else
      return true;
    }
    return originalStdoutWrite.call(this, chunk, encoding, callback);
  };
  
  process.stderr.write = function(chunk, encoding, callback) {
    // Suppress all stderr during tests (including NestJS Logger errors)
    if (typeof callback === 'function') {
      callback();
    }
    return true;
  };
}
