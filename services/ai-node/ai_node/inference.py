from __future__ import annotations

import hashlib
import io
import json
import logging
import re
from threading import Lock
from dataclasses import dataclass
from typing import Any

import numpy as np
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from sklearn.feature_extraction.text import HashingVectorizer

logger = logging.getLogger(__name__)

MODEL_VERSION = "synthetic-hr-v1"
EMBEDDING_DIMENSIONS = 128
CLUSTER_VECTOR_DIMENSIONS = 16
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
CLUSTER_PROFILE_NAMES = (
    "Cluster_Backend_Senior",
    "Cluster_Gestion_Proyectos",
    "Cluster_Hibrido_IA_Datos",
    "Cluster_Cloud_DevOps",
    "Cluster_Producto_Digital",
)

SKILL_TERMS = (
    "python", "java", "javascript", "typescript", "go", "sql", "postgresql",
    "mysql", "mongodb", "aws", "azure", "gcp", "docker", "kubernetes",
    "fastapi", "django", "flask", "spring", "laravel", "react", "angular",
    "vue", "node", "nestjs", "tensorflow", "pytorch", "scikit-learn",
    "machine learning", "data analysis", "project management", "leadership",
    "communication", "agile", "scrum", "git", "linux", "redis", "rabbitmq",
    "graphql", "rest", "grpc", "php", "c++", "c#", "rust",
)


def _get(value: Any, *keys: str, default: Any = None) -> Any:
    """Read the first present key from dict-like payloads or protobuf messages."""
    for key in keys:
        if isinstance(value, dict) and key in value:
            return value[key]
        if hasattr(value, key):
            candidate = getattr(value, key)
            if candidate not in (None, ""):
                return candidate
    return default


def _to_plain_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        return " ".join(_to_plain_text(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return " ".join(_to_plain_text(item) for item in value)
    return ""


def _names(values: Any) -> list[str]:
    if not isinstance(values, (list, tuple)):
        return []
    names: list[str] = []
    for item in values:
        value = _get(item, "name", "skill", "title", "degree", default=item)
        text = _to_plain_text(value).strip().lower()
        if text:
            names.append(text)
    return names


def _resume_text(resume: Any) -> str:
    return _to_plain_text(_get(resume, "plainText", "plain_text", "text", "summary", "description", default=""))


def _resume_skills(resume: Any) -> list[str]:
    result = _names(_get(resume, "skills", "skillSet", "skill_set", default=[]))
    if result:
        return result
    return [term for term in SKILL_TERMS if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", _resume_text(resume).lower())]


def _vacancy_skills(vacancy: Any) -> tuple[list[str], list[str]]:
    required = _names(_get(vacancy, "requiredSkills", "required_skills", "skills", default=[]))
    preferred = _names(_get(vacancy, "preferredSkills", "preferred_skills", default=[]))
    return required, preferred


def _resume_experience_years(resume: Any) -> float:
    experience = _get(resume, "experience", "workExperience", "work_experience", default=[])
    total = 0.0
    if isinstance(experience, (list, tuple)):
        for item in experience:
            years = _get(item, "yearsExperience", "years_experience", "years", default=0)
            try:
                total += max(0.0, float(years))
            except (TypeError, ValueError):
                continue
    if total:
        return min(total, 50.0)
    match = re.search(r"\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b", _resume_text(resume).lower())
    return min(float(match.group(1)), 50.0) if match else 0.0


def _education_score(resume: Any, vacancy: Any) -> float:
    education = _get(resume, "education", default=[])
    text = (_resume_text(resume) + " " + _to_plain_text(education)).lower()
    requirement = _to_plain_text(_get(vacancy, "requiredEducation", "required_education", "education", default="")).lower()
    levels = ("doctor", "phd", "master", "mba", "bachelor", "licenciatura", "degree", "associate")
    candidate_level = max((i + 1 for i, level in enumerate(levels) if level in text), default=0)
    required_level = max((i + 1 for i, level in enumerate(levels) if level in requirement), default=0)
    if required_level == 0:
        return 0.75 if text.strip() else 0.5
    if candidate_level >= required_level:
        return 1.0
    return max(0.25, candidate_level / required_level)


def _overlap_score(terms: list[str], text: str) -> float:
    tokens = {token for token in re.findall(r"[\w+#.-]+", text.lower()) if len(token) > 1}
    if not terms:
        return 0.5
    return sum(1 for term in terms if term in tokens or term in text.lower()) / len(terms)


@dataclass(frozen=True)
class ExtractionResult:
    document_id: str
    extracted_text: str
    confidence: float
    warnings: list[dict[str, str]]
    model_version: str
    skills: list[dict[str, Any]]
    education: list[dict[str, Any]]
    experience: list[dict[str, Any]]
    additional_data: dict[str, Any]


class AiInference:
    """Owns the startup-trained supervised scorer and unsupervised cluster model."""

    _visual_cnn: Any = None
    _visual_cnn_lock = Lock()

    def __init__(self) -> None:
        self.vectorizer = HashingVectorizer(
            n_features=EMBEDDING_DIMENSIONS,
            alternate_sign=False,
            norm="l2",
            token_pattern=r"(?u)\b[\w+#.-]+\b",
        )
        self.regressor = self._train_supervised_model()
        self.clusterer, self.cluster_names = self._train_cluster_model()
        self.visual_cnn: Any = None

    @staticmethod
    def _train_supervised_model() -> RandomForestRegressor:
        rng = np.random.default_rng(20250301)
        features = rng.random((1200, 5))
        nonlinear_bonus = 0.10 * np.minimum(features[:, 0], features[:, 3])
        target = np.clip(
            100 * (
                0.42 * features[:, 0]
                + 0.23 * features[:, 1]
                + 0.12 * features[:, 2]
                + 0.18 * features[:, 3]
                + 0.05 * features[:, 4]
                + nonlinear_bonus
            )
            + rng.normal(0, 3.5, size=len(features)),
            0,
            100,
        )
        model = RandomForestRegressor(n_estimators=64, max_depth=9, min_samples_leaf=3, random_state=42, n_jobs=1)
        model.fit(features, target)
        return model

    @staticmethod
    def _train_cluster_model() -> tuple[KMeans, dict[int, str]]:
        rng = np.random.default_rng(20250302)
        prototypes = np.zeros((len(CLUSTER_PROFILE_NAMES), CLUSTER_VECTOR_DIMENSIONS), dtype=float)
        prototypes[0, [0, 1, 7, 11]] = [0.95, 0.8, 0.9, 0.7]
        prototypes[1, [8, 9, 10, 15]] = [0.95, 0.85, 0.75, 0.65]
        prototypes[2, [2, 3, 4, 12]] = [0.95, 0.85, 0.8, 0.7]
        prototypes[3, [5, 6, 11, 14]] = [0.95, 0.85, 0.75, 0.7]
        prototypes[4, [0, 8, 10, 13]] = [0.65, 0.7, 0.85, 0.9]
        samples = np.vstack(
            [rng.normal(loc=prototype, scale=0.12, size=(80, CLUSTER_VECTOR_DIMENSIONS)) for prototype in prototypes]
        )
        model = KMeans(n_clusters=len(CLUSTER_PROFILE_NAMES), random_state=42, n_init=10)
        model.fit(samples)
        names = {
            cluster_id: CLUSTER_PROFILE_NAMES[int(np.argmin(np.linalg.norm(prototypes - center, axis=1)))]
            for cluster_id, center in enumerate(model.cluster_centers_)
        }
        return model, names

    @staticmethod
    def _train_visual_cnn() -> Any:
        import tensorflow as tf

        tf.random.set_seed(20250303)
        rng = np.random.default_rng(20250303)
        images = np.clip(rng.normal(0.92, 0.04, size=(160, 64, 64, 3)), 0, 1).astype(np.float32)
        labels = np.zeros((len(images), 2), dtype=np.float32)
        yy, xx = np.ogrid[:64, :64]
        for index in range(len(images)):
            has_structure = index % 2 == 0
            has_seal = (index // 2) % 2 == 0
            if has_structure:
                images[index, 3:61, 3, :] = 0.15
                images[index, 3:61, 60, :] = 0.15
                images[index, 3, 3:61, :] = 0.15
                images[index, 60, 3:61, :] = 0.15
                for row in (14, 22, 30, 38, 46, 54):
                    images[index, row:row + 2, 8:52, :] = 0.35
                labels[index, 0] = 1.0
            if has_seal:
                center_x = 43 + int(rng.integers(-3, 4))
                center_y = 47 + int(rng.integers(-3, 4))
                radius = 6
                stamp = (xx - center_x) ** 2 + (yy - center_y) ** 2 <= radius**2
                images[index][stamp] = np.asarray([0.82, 0.12, 0.08], dtype=np.float32)
                labels[index, 1] = 1.0

        model = tf.keras.Sequential([
            tf.keras.layers.Input(shape=(64, 64, 3)),
            tf.keras.layers.Conv2D(8, 3, strides=2, padding="same", activation="relu"),
            tf.keras.layers.Conv2D(12, 3, strides=2, padding="same", activation="relu"),
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(2, activation="sigmoid"),
        ])
        model.compile(optimizer="adam", loss="binary_crossentropy")
        model.fit(images, labels, epochs=3, batch_size=16, verbose=0)
        return model

    def generate_embedding(self, text: str) -> list[float]:
        if not text.strip():
            return [0.0] * EMBEDDING_DIMENSIONS
        vector = self.vectorizer.transform([text]).toarray()[0]
        return vector.astype(float).tolist()

    def predict_compatibility(self, resume: Any, vacancy: Any, resume_embedding: Any = None, vacancy_embedding: Any = None) -> dict[str, Any]:
        resume_text = _resume_text(resume)
        required, preferred = _vacancy_skills(vacancy)
        candidate_skills = _resume_skills(resume)
        required_score = (
            sum(any(skill == required_skill or skill in required_skill or required_skill in skill for skill in candidate_skills) for required_skill in required)
            / len(required)
            if required
            else _overlap_score(preferred, resume_text)
        )
        if preferred:
            preferred_score = sum(any(skill == preferred_skill or skill in preferred_skill or preferred_skill in skill for skill in candidate_skills) for preferred_skill in preferred) / len(preferred)
            skills_score = 0.85 * required_score + 0.15 * preferred_score if required else preferred_score
        else:
            skills_score = required_score

        required_years = _get(vacancy, "minimumExperienceYears", "minimum_experience_years", "experienceYears", "experience_years", default=0)
        try:
            required_years = max(0.0, float(required_years))
        except (TypeError, ValueError):
            required_years = 0.0
        experience_years = _resume_experience_years(resume)
        experience_score = min(experience_years / required_years, 1.0) if required_years > 0 else min(experience_years / 5.0, 1.0)
        if required_years == 0 and experience_years == 0:
            experience_score = 0.65
        education_score = _education_score(resume, vacancy)

        vacancy_text = " ".join([
            _to_plain_text(_get(vacancy, "title", "titulo", default="")),
            _to_plain_text(_get(vacancy, "description", default="")),
            " ".join(required + preferred),
        ])
        if resume_embedding and vacancy_embedding:
            left = np.asarray(resume_embedding, dtype=float)
            right = np.asarray(vacancy_embedding, dtype=float)
            semantic_score = float(np.dot(left, right) / (np.linalg.norm(left) * np.linalg.norm(right))) if left.shape == right.shape and np.linalg.norm(left) and np.linalg.norm(right) else 0.0
            semantic_score = max(0.0, min(1.0, semantic_score))
        else:
            semantic_score = _overlap_score(required + preferred, resume_text) if required or preferred else _overlap_score(re.findall(r"[\w+#.-]+", vacancy_text), resume_text)

        text_length_score = min(len(resume_text) / 3000.0, 1.0)
        communication_score = max(0.2, min(1.0, 0.45 + 0.55 * text_length_score))
        feature_vector = np.asarray([[skills_score, experience_score, education_score, semantic_score, communication_score]], dtype=float)
        model_score = float(self.regressor.predict(feature_vector)[0])
        score = max(0.0, min(100.0, model_score))
        return {
            "score": round(score, 2),
            "breakdown": {
                "skillsScore": round(skills_score * 100, 2),
                "experienceScore": round(experience_score * 100, 2),
                "educationScore": round(education_score * 100, 2),
                "semanticScore": round(semantic_score * 100, 2),
                "modelScore": round(score, 2),
                "customScores": {
                    "communication": round(communication_score * 100, 2),
                    "experienceYears": round(experience_years, 2),
                },
            },
            "explanation": f"Evaluación supervisada de {len(required)} habilidades requeridas, experiencia y formación frente a la vacante.",
            "modelVersion": MODEL_VERSION,
        }

    def cluster_talents(self, talents: list[dict[str, Any]], cluster_count: int = 5) -> dict[str, Any]:
        if not talents:
            return {"assignments": [], "modelVersion": MODEL_VERSION}
        count = max(1, min(int(cluster_count or 5), len(talents), 20))
        matrix = np.zeros((len(talents), CLUSTER_VECTOR_DIMENSIONS), dtype=float)
        for index, talent in enumerate(talents):
            raw = np.asarray(talent.get("vector", []), dtype=float).reshape(-1)
            if raw.size == 0:
                raise ValueError("Cada talento debe proporcionar un vector no vacío")
            length = min(raw.size, CLUSTER_VECTOR_DIMENSIONS)
            matrix[index, :length] = raw[:length]
        model = self.clusterer if count == len(CLUSTER_PROFILE_NAMES) else KMeans(n_clusters=count, random_state=42, n_init=10)
        labels = model.predict(matrix) if count == len(CLUSTER_PROFILE_NAMES) else model.fit_predict(matrix)
        distances = model.transform(matrix)
        return {
            "assignments": [
                {
                    "candidateId": str(talent.get("candidateId", "")),
                    "clusterId": int(labels[i]),
                    "clusterName": self.cluster_names[int(labels[i])] if count == len(CLUSTER_PROFILE_NAMES) else f"Cluster_Afinidad_{int(labels[i])}",
                    "distanceToCentroid": float(distances[i, labels[i]]),
                }
                for i, talent in enumerate(talents)
            ],
            "modelVersion": MODEL_VERSION,
        }

    def extract_document(
        self,
        document_id: str,
        document_type: str | int,
        content_type: str,
        content: bytes,
        language_hint: str = "",
    ) -> ExtractionResult:
        if len(content) > MAX_DOCUMENT_BYTES:
            raise ValueError(f"El documento excede el límite de {MAX_DOCUMENT_BYTES} bytes")
        if not content:
            raise ValueError("El documento está vacío")

        document_kind = str(document_type).upper()
        if document_kind in {"4", "DOCUMENT_TYPE_VIDEO_CV"} or content_type.startswith("video/"):
            metadata = self._analyze_video_bytes(content)
            text = " ".join(item.get("text", "") for item in metadata.get("frames", []))
            warnings = [] if text else [{"code": "VIDEO_OCR_EMPTY", "message": "No se pudo extraer texto de los fotogramas del video", "field": "content"}]
            return self._extraction_result(document_id, text, warnings, metadata)

        additional_data: dict[str, Any] = {"documentType": document_kind, "contentType": content_type}
        warnings: list[dict[str, str]] = []
        text = ""
        if content_type in {"text/plain", "text/markdown"} or content_type.endswith("+json") or content_type == "application/json":
            decoded = content.decode("utf-8", errors="replace")
            if content_type == "application/json" or content_type.endswith("+json"):
                try:
                    text = _to_plain_text(json.loads(decoded))
                except json.JSONDecodeError:
                    text = decoded
            else:
                text = decoded
        elif content_type == "application/pdf" or content[:5] == b"%PDF-":
            try:
                from pypdf import PdfReader

                reader = PdfReader(io.BytesIO(content))
                text = "\n".join(page.extract_text() or "" for page in reader.pages)
                additional_data["pageCount"] = len(reader.pages)
                if not text.strip():
                    try:
                        import pypdfium2 as pdfium

                        pdf_document = pdfium.PdfDocument(content)
                        ocr_pages: list[str] = []
                        for page_number in range(min(len(pdf_document), 5)):
                            page = pdf_document[page_number]
                            bitmap = page.render(scale=1.5)
                            image_buffer = io.BytesIO()
                            bitmap.to_pil().save(image_buffer, format="PNG")
                            ocr_result = self._process_image(image_buffer.getvalue())
                            if ocr_result.get("extractedText"):
                                ocr_pages.append(ocr_result["extractedText"])
                        text = "\n".join(ocr_pages)
                        additional_data["ocrPagesAnalyzed"] = min(len(pdf_document), 5)
                    except Exception as exc:
                        warnings.append({"code": "PDF_OCR_FAILED", "message": str(exc)[:200], "field": "content"})
            except Exception as exc:  # corrupt, encrypted, or unsupported PDFs become a warning
                warnings.append({"code": "PDF_PARSE_FAILED", "message": str(exc)[:200], "field": "content"})
        elif content_type.startswith("image/") or content[:3] == b"\xff\xd8\xff" or content[:8] == b"\x89PNG\r\n\x1a\n":
            image_metadata = self._process_image(content)
            additional_data.update(image_metadata)
            text = image_metadata.pop("extractedText", "")
            if not text:
                warnings.append({"code": "OCR_EMPTY", "message": "No se pudo extraer texto OCR; se conservaron los metadatos visuales", "field": "content"})
        else:
            text = content.decode("utf-8", errors="replace")
            warnings.append({"code": "UNRECOGNIZED_CONTENT_TYPE", "message": f"Se intentó extraer texto de {content_type or 'tipo desconocido'}", "field": "contentType"})

        if not text.strip():
            warnings.append({"code": "EMPTY_EXTRACTED_TEXT", "message": "El documento no contiene texto extraíble", "field": "content"})
        additional_data["languageHint"] = language_hint
        return self._extraction_result(document_id, text, warnings, additional_data)

    @staticmethod
    def _extraction_result(document_id: str, text: str, warnings: list[dict[str, str]], additional_data: dict[str, Any]) -> ExtractionResult:
        lowered = text.lower()
        skills = [{"name": term, "proficiency": 0.7, "yearsExperience": 0} for term in SKILL_TERMS if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", lowered)]
        education_terms = ("bachelor", "licenciatura", "master", "doctor", "phd", "ingeniería", "ingenieria", "universidad")
        education = [{"degree": term, "institution": ""} for term in education_terms if term in lowered]
        experience: list[dict[str, Any]] = []
        years_match = re.search(r"\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience\b", lowered)
        if years_match:
            experience.append({"description": f"{years_match.group(1)} years of experience", "yearsExperience": int(years_match.group(1))})
        confidence = min(0.99, 0.35 + len(text.strip()) / 2000.0) if text.strip() else 0.0
        return ExtractionResult(document_id, text, confidence, warnings, MODEL_VERSION, skills, education, experience, additional_data)

    def _process_image(self, content: bytes) -> dict[str, Any]:
        try:
            import tensorflow as tf

            image = tf.io.decode_image(content, channels=3, expand_animations=False)
            height, width = (int(value) for value in image.shape[:2])
            normalized = tf.image.convert_image_dtype(image, tf.float32)
            resized = tf.image.resize(normalized, (224, 224), antialias=True)
            contrast = float(tf.math.reduce_std(resized).numpy())
            brightness = float(tf.reduce_mean(resized).numpy())
            edge_map = tf.image.sobel_edges(tf.expand_dims(resized, axis=0))
            edge_strength = tf.sqrt(tf.reduce_sum(tf.square(edge_map), axis=-1))
            edge_density = float(tf.reduce_mean(tf.cast(edge_strength > 0.12, tf.float32)).numpy())
            red_pixels = tf.logical_and(
                resized[:, :, 0] > resized[:, :, 1] * 1.35,
                resized[:, :, 0] > resized[:, :, 2] * 1.25,
            )
            red_mark_ratio = float(tf.reduce_mean(tf.cast(red_pixels, tf.float32)).numpy())
            if self.visual_cnn is None:
                with self._visual_cnn_lock:
                    if AiInference._visual_cnn is None:
                        AiInference._visual_cnn = self._train_visual_cnn()
                    self.visual_cnn = AiInference._visual_cnn
            cnn_input = tf.image.resize(resized, (64, 64), antialias=True)
            structure_score, seal_score = (
                float(value)
                for value in self.visual_cnn.predict(tf.expand_dims(cnn_input, axis=0), verbose=0)[0]
            )
            metadata: dict[str, Any] = {
                "imageWidth": width,
                "imageHeight": height,
                "processedWidth": 224,
                "processedHeight": 224,
                "meanBrightness": round(brightness, 4),
                "contrast": round(contrast, 4),
                "edgeDensity": round(edge_density, 4),
                "redMarkRatio": round(red_mark_ratio, 4),
                "cnnStructureScore": round(structure_score, 4),
                "cnnSealCandidateScore": round(seal_score, 4),
                "visualValidation": {
                    "documentStructureDetected": edge_density >= 0.025 or structure_score >= 0.5,
                    "possibleColorSealOrStamp": red_mark_ratio >= 0.008 or seal_score >= 0.5,
                    "requiresHumanReview": edge_density < 0.025 and structure_score < 0.5,
                },
            }
        except Exception as exc:
            raise ValueError(f"No se pudo decodificar la imagen: {exc}") from exc

        try:
            from PIL import Image
            import pytesseract

            image_pil = Image.open(io.BytesIO(content)).convert("RGB")
            metadata["extractedText"] = pytesseract.image_to_string(image_pil).strip()
        except Exception as exc:
            logger.debug("OCR no disponible para imagen: %s", exc)
            metadata["extractedText"] = ""
        return metadata

    def _analyze_video_bytes(self, content: bytes) -> dict[str, Any]:
        try:
            import av

            container = av.open(io.BytesIO(content))
            stream = container.streams.video[0]
            frames: list[dict[str, Any]] = []
            target_count = 5
            interval = max(1, int((stream.frames or target_count) / target_count))
            for index, frame in enumerate(container.decode(stream)):
                if index % interval:
                    continue
                buffer = io.BytesIO()
                frame.to_image().save(buffer, format="PNG")
                visual = self._process_image(buffer.getvalue())
                visual.update(self._frame_attention_indicators(frame))
                frames.append({"frameNumber": index, "timeSeconds": float(frame.time or 0), "text": visual.pop("extractedText", ""), **visual})
                if len(frames) >= target_count:
                    break
            duration = float(stream.duration * stream.time_base) if stream.duration and stream.time_base else 0.0
            audio = self._audio_activity(container)
            detected_faces = [frame for frame in frames if frame.get("faceDetected")]
            eye_contact_ratio = (
                sum(bool(frame.get("eyesVisible")) for frame in detected_faces) / len(detected_faces)
                if detected_faces
                else 0.0
            )
            attention_ratio = len(detected_faces) / len(frames) if frames else 0.0
            return {
                "durationSeconds": round(duration, 2),
                "frameRate": float(stream.average_rate) if stream.average_rate else 0.0,
                "width": int(stream.width),
                "height": int(stream.height),
                "framesAnalyzed": len(frames),
                "frames": frames,
                "indicators": {
                    "eyeContactEstimate": round(eye_contact_ratio, 3),
                    "attentionEstimate": round(attention_ratio, 3),
                    "verbalActivityEstimate": audio["activityRatio"],
                    "verbalFluencyProxy": audio["fluencyProxy"],
                    "audioAvailable": audio["available"],
                    "interpretation": "Estimaciones heurísticas; no sustituyen evaluación humana ni análisis clínico.",
                },
            }
        except Exception as exc:
            raise ValueError(f"No se pudo analizar el video: {exc}") from exc

    @staticmethod
    def _frame_attention_indicators(frame: Any) -> dict[str, Any]:
        try:
            import cv2

            image = frame.to_ndarray(format="bgr24")
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            face_detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
            eye_detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")
            faces = face_detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
            eyes_visible = False
            for x, y, width, height in faces:
                face_gray = gray[y:y + height, x:x + width]
                eyes_visible = len(eye_detector.detectMultiScale(face_gray, scaleFactor=1.1, minNeighbors=4)) >= 2
                if eyes_visible:
                    break
            return {
                "faceDetected": len(faces) > 0,
                "eyesVisible": eyes_visible,
                "faceCount": int(len(faces)),
            }
        except Exception:
            logger.debug("Face/eye detection unavailable for a sampled frame", exc_info=True)
            return {"faceDetected": False, "eyesVisible": False, "faceCount": 0}

    @staticmethod
    def _audio_activity(container: Any) -> dict[str, Any]:
        import numpy as np

        try:
            streams = container.streams.audio
            if not streams:
                return {"available": False, "activityRatio": 0.0, "fluencyProxy": 0.0}
            container.seek(0)
            energies: list[float] = []
            sampled_frames = 0
            for frame in container.decode(streams[0]):
                samples = frame.to_ndarray().astype(np.float32)
                if samples.size:
                    energies.append(float(np.sqrt(np.mean(np.square(samples)))))
                    sampled_frames += 1
                if sampled_frames >= 1500:
                    break
            if not energies:
                return {"available": True, "activityRatio": 0.0, "fluencyProxy": 0.0}
            threshold = max(float(np.percentile(energies, 30)) * 1.8, 1.0)
            active = [energy >= threshold for energy in energies]
            activity_ratio = sum(active) / len(active)
            transitions = sum(active[index] != active[index - 1] for index in range(1, len(active)))
            fluency_proxy = min(1.0, activity_ratio * (1.0 - min(transitions / max(len(active), 1), 0.75)))
            return {
                "available": True,
                "activityRatio": round(activity_ratio, 3),
                "fluencyProxy": round(fluency_proxy, 3),
            }
        except Exception:
            logger.debug("Audio activity analysis unavailable", exc_info=True)
            return {"available": False, "activityRatio": 0.0, "fluencyProxy": 0.0}

    async def analyze_video(self, content: bytes) -> dict[str, Any]:
        import asyncio

        return await asyncio.to_thread(self._analyze_video_bytes, content)


def stable_document_id(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
