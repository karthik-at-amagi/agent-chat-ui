from langgraph_sdk import get_client
import asyncio

async def main():
    client = get_client(url="http://10.0.4.244:2024")
    try:
        thread = await client.threads.get("144479be-035b-481e-836e-6193b0e16ab9")
        print(f"Found thread: {thread}")
    except Exception as e:
        print(f"Error: {e}")

    # Also list all
    threads = await client.threads.search(limit=100)
    print(f"Total threads found: {len(threads)}")
    for t in threads:
        if t['thread_id'] == "144479be-035b-481e-836e-6193b0e16ab9":
            print("MATCH FOUND IN SEARCH")

if __name__ == "__main__":
    asyncio.run(main())
