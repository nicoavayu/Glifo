import cors from "cors";
import express from "express";
import { transcribeRouter } from "./routes/transcribe";

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());
app.use(transcribeRouter);

app.listen(port, () => {
  console.log(`Transcribe server escuchando en http://localhost:${port}`);
});
