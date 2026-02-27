import pdfplumber
import sys

def parse_pdf(file_path):
    try:
        with pdfplumber.open(file_path) as pdf:
            text = ""
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            # Use buffer to write binary data (UTF-8) to stdout
            sys.stdout.buffer.write(text.encode('utf-8'))
    except Exception as e:
        sys.stderr.write(f"Error parsing PDF: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)
    parse_pdf(sys.argv[1])