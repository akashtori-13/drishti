#!/usr/bin/env python3
"""
Probe script for SpectraHunt data sources.

Verifies all assumptions about endpoints, table names, column names, etc.
Reports verified / not verified / failed for each item.

Run with: python scripts/probe_endpoints.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


async def probe_sia2():
    """Verify SIA2 endpoint."""
    print("\n=== SIA2 Endpoint ===")
    
    import httpx
    from backend.config import IRSA_SIA2_ENDPOINT, SIA2_COLLECTION_WIDE, USER_AGENT
    
    # Test query at a known position
    params = {
        "COLLECTION": SIA2_COLLECTION_WIDE,
        "POS": "circle 180.0 0.0 0.5",
        "RESPONSEFORMAT": "VOTABLE",
        "VERB": 1
    }
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                IRSA_SIA2_ENDPOINT,
                params=params,
                headers={"User-Agent": USER_AGENT}
            )
            
            if response.status_code == 200:
                content = response.text[:500]
                if "VOTABLE" in content or "RESOURCE" in content:
                    print("✓ SIA2 endpoint responds with VOTable")
                    return True
                else:
                    print(f"✗ SIA2 response format unexpected: {content[:100]}")
                    return False
            else:
                print(f"✗ SIA2 returned status {response.status_code}")
                return False
                
    except Exception as e:
        print(f"✗ SIA2 probe failed: {e}")
        return False


async def probe_tap():
    """Verify TAP endpoint and discover tables."""
    print("\n=== TAP Endpoint ===")
    
    import httpx
    from backend.config import IRSA_TAP_ENDPOINT, USER_AGENT
    
    # Query TAP_SCHEMA.tables
    query = "SELECT TOP 5 table_name FROM TAP_SCHEMA.tables"
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{IRSA_TAP_ENDPOINT}/sync",
                params={"QUERY": query, "FORMAT": "json"},
                headers={"User-Agent": USER_AGENT}
            )
            
            if response.status_code == 200:
                data = response.json()
                print("✓ TAP endpoint responds")
                
                # Check for spherex.obscore
                tables = [row[0] for row in data.get("data", [])]
                if any("spherex" in t.lower() for t in tables):
                    print("✓ SPHEREx tables found in TAP schema")
                    return True
                else:
                    print(f"? TAP works but no obvious SPHEREx table. Tables: {tables[:10]}")
                    return None  # Uncertain
                    
            else:
                print(f"✗ TAP returned status {response.status_code}")
                return False
                
    except Exception as e:
        print(f"✗ TAP probe failed: {e}")
        return False


async def probe_skybot():
    """Verify SkyBoT endpoint."""
    print("\n=== SkyBoT Endpoint ===")
    
    import httpx
    from backend.config import SKYBOT_ENDPOINT, USER_AGENT
    
    # Test cone search at a position with known asteroids
    params = {
        "-sys": "all",
        "-pos": "180.0,0.0",
        "-dist": "0.01",  # 0.01 degrees
        "-date": "2025/01/01",
        "-format": "json"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{SKYBOT_ENDPOINT}skybot_cone_search.php",
                params=params,
                headers={"User-Agent": USER_AGENT}
            )
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    print(f"✓ SkyBoT responds (found {len(data)} objects)")
                    return True
                else:
                    print(f"? SkyBoT responds but format unclear: {type(data)}")
                    return None
            else:
                print(f"✗ SkyBoT returned status {response.status_code}")
                return False
                
    except Exception as e:
        print(f"✗ SkyBoT probe failed: {e}")
        return False


async def probe_cutout_service():
    """Verify IRSA cutout service."""
    print("\n=== Cutout Service ===")
    
    import httpx
    from backend.config import IRSA_CUTOUT_BASE, USER_AGENT
    
    # Try a sample cutout URL pattern
    # This is a representative URL - may not point to real data
    test_url = f"{IRSA_CUTOUT_BASE}/level2/2025W19_2B/l2b-v20-2025-247/3/level2_2025W19_2B_0073_2D3_spx_l2b-v20-2025-247.fits?center=156.09,-41.64&size=0.1"
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.head(test_url, headers={"User-Agent": USER_AGENT})
            
            if response.status_code in [200, 302]:
                print("✓ Cutout service URL pattern valid")
                return True
            elif response.status_code == 404:
                print("? Cutout service reachable but specific file not found (expected)")
                return None
            else:
                print(f"✗ Cutout service returned status {response.status_code}")
                return False
                
    except Exception as e:
        print(f"✗ Cutout service probe failed: {e}")
        return False


async def probe_aws_s3():
    """Verify AWS S3 bucket accessibility."""
    print("\n=== AWS S3 (Unsigned) ===")
    
    try:
        import boto3
        from botocore import UNSIGNED
        from botocore.config import Config
        from backend.config import AWS_BUCKET, AWS_REGION, AWS_PREFIX
        
        s3 = boto3.client(
            's3',
            region_name=AWS_REGION,
            config=Config(signature_version=UNSIGNED)
        )
        
        # List a few objects in the prefix
        response = s3.list_objects_v2(Bucket=AWS_BUCKET, Prefix=AWS_PREFIX, MaxKeys=5)
        
        if 'Contents' in response and len(response['Contents']) > 0:
            print(f"✓ AWS S3 bucket accessible (showing {len(response['Contents'])} keys)")
            for obj in response['Contents'][:3]:
                print(f"  - {obj['Key']}")
            return True
        else:
            print("? AWS S3 accessible but no objects found in prefix")
            return None
            
    except ImportError:
        print("- boto3 not installed, skipping AWS S3 probe")
        return None
    except Exception as e:
        print(f"✗ AWS S3 probe failed: {e}")
        return False


async def main():
    """Run all probes and report results."""
    print("=" * 60)
    print("SpectraHunt Data Source Probe Report")
    print("=" * 60)
    print(f"Date: {__import__('datetime').datetime.now().isoformat()}")
    
    results = {}
    
    # Run all probes
    results["sia2"] = await probe_sia2()
    results["tap"] = await probe_tap()
    results["skybot"] = await probe_skybot()
    results["cutout"] = await probe_cutout_service()
    results["aws_s3"] = await probe_aws_s3()
    
    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    verified = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    uncertain = sum(1 for v in results.values() if v is None)
    
    for name, result in results.items():
        status = "✓" if result is True else ("✗" if result is False else "?")
        print(f"  {status} {name}: {'verified' if result is True else ('failed' if result is False else 'uncertain')}")
    
    print(f"\nVerified: {verified}, Failed: {failed}, Uncertain: {uncertain}")
    
    if failed > 0:
        print("\n⚠ Some endpoints failed verification.")
        print("The code handles failures gracefully, but live data access may be limited.")
    
    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
