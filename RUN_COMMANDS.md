```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

cd ../frontend
npm install

# Terminal 1
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2
cd frontend
npm run dev
```