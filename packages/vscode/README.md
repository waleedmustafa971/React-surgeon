# React Surgeon

Click a bug. Diagnose, fix, and verify React applications locally.

Requires Node.js 22.12+, npm, llama.cpp on PATH, and a trusted React/Vite workspace with the React Surgeon Vite plugin installed. Run the application, choose Connect project in the React Surgeon sidebar, select an element, describe its bug, and supply a JSON acceptance scenario. Qwen inference stays local; the model stops before Chromium verification. The first run downloads model weights.

Commands include Doctor, Start, Stop, Start Local Model, Select UI Element, Diagnose Selected Element, Verify Current Fix, Open X-Ray, Show Proof, and Show Logs. Proof files are stored in .react-surgeon/proofs. This is an MVP: review generated patches and use trusted projects only.
