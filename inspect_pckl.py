import glob
import re

path = "/home/karthik/repos/promo_experiments/experiments/summarization_experiments/reverse_summarization/.langgraph_api/.*.pckl"
for f in glob.glob(path):
    print(f"File: {f}")
    try:
        with open(f, "rb") as bf:
            content = bf.read()
            if b"144479be-035b-481e-836e-6193b0e16ab9" in content:
                print("  Found ID in binary content")
                pos = content.find(b"144479be-035b-481e-836e-6193b0e16ab9")
                start = max(0, pos - 1000)
                end = min(len(content), pos + 1000)
                context = content[start:end]
                strings = re.findall(b"[\x20-\x7E]{4,}", context)
                print(f"  Strings in context: {strings}")
    except Exception as e:
        print(f"  Error: {e}")
