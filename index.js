import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper function to extract clean username from URL or raw handle
const extractUsername = (input) => {
    if (!input) return '';
    let cleaned = input.trim();
    const match = cleaned.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_\.]+)\/?/);
    if (match && match[1]) {
        return match[1];
    }
    return cleaned.replace(/^@/, '');
};

app.get('/', (req, res) => {
    res.json({ message: 'Instagram Scraper API is running successfully! 🚀' });
});

// 1. Profile Lookup Route
app.get('/api/lookup', async (req, res) => {
    const rawIdentifier = req.query.q;

    if (!rawIdentifier) {
        return res.status(400).json({ success: false, message: 'Please provide a username or profile URL using "?q=".' });
    }

    const username = extractUsername(rawIdentifier);
    if (!username) {
        return res.status(400).json({ success: false, message: 'Invalid username or profile URL.' });
    }

    const options = {
        method: 'GET',
        url: `https://${process.env.RAPIDAPI_HOST}/profile`, 
        params: { username: username }, 
        headers: {
            'Content-Type': 'application/json',
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': process.env.RAPIDAPI_HOST
        }
    };

    try {
        const response = await axios.request(options);
        res.json({ success: true, searchedFor: rawIdentifier, extractedUsername: username, data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch profile data.', error: error.response?.data || error.message });
    }
});

// 2. Posts Fetching Route with Filters (Limit & Newer Than)
app.get('/api/posts', async (req, res) => {
    const rawIdentifier = req.query.q; 
    const limit = parseInt(req.query.limit) || 10; 
    const newerThanDate = req.query.newer_than ? new Date(req.query.newer_than) : null; 

    if (!rawIdentifier) {
        return res.status(400).json({ success: false, message: 'Please provide a username or profile URL using "?q=".' });
    }

    const username = extractUsername(rawIdentifier);
    if (!username) {
        return res.status(400).json({ success: false, message: 'Invalid username or profile URL.' });
    }

    try {
        // Step A: Get User ID by Username
        console.log(`Fetching user_id for username: ${username}...`);
        const idResponse = await axios.get(`https://${process.env.RAPIDAPI_HOST}/user_id_by_username`, {
            params: { username: username },
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': process.env.RAPIDAPI_HOST
            }
        });

        const rawData = idResponse.data;
        const userId = rawData?.UserID || rawData?.user_id || rawData?.id || rawData?.pk || rawData?.result?.id || (typeof rawData !== 'object' ? rawData : null);
        
        if (!userId || typeof userId === 'object') {
            return res.status(404).json({ 
                success: false, 
                message: 'Could not extract valid User ID from response.', 
                rawData 
            });
        }

        console.log(`Extracted User ID: ${userId}. Fetching feed/posts...`);

        // Step B: Fetch Feed/Posts using User ID
        const feedResponse = await axios.get(`https://${process.env.RAPIDAPI_HOST}/feed`, {
            params: { user_id: userId },
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': process.env.RAPIDAPI_HOST
            }
        });

        let posts = feedResponse.data?.items || feedResponse.data?.posts || feedResponse.data || [];

        // Apply "Newer Than" Date Filter if provided
        if (newerThanDate && !isNaN(newerThanDate.getTime())) {
            posts = posts.filter(post => {
                const postTimestamp = post.taken_at ? new Date(post.taken_at * 1000) : null;
                return postTimestamp && postTimestamp >= newerThanDate;
            });
        }

        // Apply Post Limit
        if (limit && Array.isArray(posts)) {
            posts = posts.slice(0, limit);
        }

        res.json({
            success: true,
            username: username,
            userId: userId,
            totalFetched: posts.length,
            posts: posts
        });

    } catch (error) {
        console.error("Error fetching posts:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch Instagram posts.',
            error: error.response?.data || error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});