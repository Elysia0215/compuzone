# dev.py
# An orchestrator script to run both Flask backend and Vite frontend concurrently during development

import subprocess
import sys
import os
import time

def check_npx_available():
    """Check if npx is available in the system PATH."""
    use_shell = os.name == 'nt'
    try:
        # Run 'where' (Windows) or 'which' (Mac/Linux) to find npx
        cmd = ["where", "npx"] if os.name == 'nt' else ["which", "npx"]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, shell=use_shell)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def main():
    print("====================================================")
    print("Compuzone Chatbot - Python Backend Development Runner")
    print("====================================================\n")
    
    # 1. Launch Flask Backend API Server on port 8000
    env = os.environ.copy()
    env["FLASK_ENV"] = "development"
    env["PYTHONUNBUFFERED"] = "1"  # Ensure instant log output flushing
    
    backend_cmd = [sys.executable, "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
    print("-> Starting FastAPI backend API server on port 8000...")
    backend_proc = subprocess.Popen(
        backend_cmd,
        env=env,
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    
    # Wait briefly for Flask to bind to port 8000
    time.sleep(1.5)
    
    # 2. Check for Node.js / npx and launch Vite dev server on port 3000
    has_node = check_npx_available()
    frontend_proc = None
    
    if has_node:
        use_shell = os.name == 'nt'
        frontend_cmd = ["npx", "vite", "--port", "3000"]
        print("-> Starting Vite frontend development server on port 3000...")
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            shell=use_shell,
            stdout=sys.stdout,
            stderr=sys.stderr
        )
    else:
        print("\n[!] WARNING: 'npx' command was not found on your system PATH.")
        print("    Node.js is required to compile and hot-reload the React frontend.")
        print("    Please install Node.js from https://nodejs.org/ to view the website.")
        print("    Currently, only the Python Flask backend is running on port 8000.\n")
    
    try:
        # Keep monitoring the running processes
        while True:
            if backend_proc.poll() is not None:
                print("Backend server stopped.")
                break
            if frontend_proc and frontend_proc.poll() is not None:
                print("Frontend dev server stopped.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[Ctrl+C] Stopping active servers...")
    finally:
        print("Cleaning up active processes...")
        backend_proc.terminate()
        if frontend_proc:
            frontend_proc.terminate()
            
        try:
            backend_proc.wait(timeout=3)
            if frontend_proc:
                frontend_proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            print("Force-killing unresponsive processes...")
            backend_proc.kill()
            if frontend_proc:
                frontend_proc.kill()
        print("Shutdown sequence completed. Bye!")

if __name__ == "__main__":
    main()
