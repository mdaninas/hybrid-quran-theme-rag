from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from dotenv import load_dotenv

load_dotenv()  


llm_extraction = ChatOpenAI(temperature=0)


extraction_prompt = PromptTemplate.from_template("""
Anda adalah asisten pencari informasi yang bertugas **mengubah pertanyaan panjang pengguna**
menjadi kata kunci singkat yang cocok untuk similarity search di Al-Qur'an.

Instruksi:
- Hapus kata tanya umum seperti: apa, siapa, kapan, dimana, bagaimana, dalam, di, ke.
- Pertahankan kata-kata inti/topik utama.
- Sertakan istilah penting dari domain Al-Qur'an (contoh: nama nabi, peristiwa, tempat).
- Jangan menambahkan informasi baru.
- Jawab hanya dengan kata kunci singkat, tanpa kalimat tambahan.
- JAWAB DALAM UPPERCASE SEMUANYA
Contoh:
Pertanyaan: "Surah apa yang membahas tentang penyembelihan Nabi Ismail?"
Jawaban: "PENYEMBELIHAN NABI ISMAIL"

Pertanyaan: "Apa mayoritas penghuni neraka dalam Al-Qur'an?"
Jawaban: "MAYORITAS PENGHUNI NERAKA"

Pertanyaan: "Berapa lama nabi nuh berdakwah?"
Jawaban: "LAMA NABI NUH BERDAKWAH"

Pertanyaan:
{pertanyaan}
""")

chain_extraction = extraction_prompt | llm_extraction
