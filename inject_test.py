from database import save_snapshot 
import hashlib 
fake = 'Notion pricing updated: Plus plan now $16/month, up from $12. Team plan $20/user.' 
save_snapshot('Notion', 'pricing', 'https://www.notion.so/pricing', fake, hashlib.md5(fake.encode()).hexdigest()) 
