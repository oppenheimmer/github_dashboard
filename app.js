// No client-side GitHub token: GraphQL data comes through the /api/github
// proxy (see server.js), which reads the token from GITHUB_TOKEN in
// .env.local on the server side. Embedders that host this script without
// that endpoint can pass a custom `apiBase` option, or the dashboard falls
// back to unauthenticated REST (60 req/hr, degraded data).
class GitHubDashboard {
    constructor(options = {}) {
        this.currentYear = new Date().getFullYear();
        this.apiCache = new Map();
        this.availableYears = [];
        this.currentUsers = [];
        this.currentUserProfiles = [];
        this.apiBase = options.apiBase || '/api/github';
        this.root = options.root || document;
        this.defaultUsers = ['havebleu', 'oppenheimmer'];
        this.activeTooltip = null;
        this.init();
    }

    init() {
        this.setupAvailableYears();
        this.loadProfiles(this.defaultUsers); // Default user pair
        this.setupGlobalListeners();
    }

    qs(selector) {
        return this.root.querySelector(selector);
    }

    setupAvailableYears() {
        const currentYear = new Date().getFullYear();
        // Only current year and previous year
        this.availableYears = [currentYear, currentYear - 1];
    }

    async loadProfiles(usernames) {
        try {
            this.showLoading();
            this.currentUsers = usernames;

            const profiles = [];

            for (const username of usernames) {
                const result = await this.fetchFromProxy({ type: 'profile', user: username });

                if (!result || !result.user) {
                    this.showError(`User ${username} not found or proxy error`);
                    profiles.push({
                        login: username,
                        name: username,
                        followers: 0,
                        following: 0,
                        public_repos: 0,
                        starred_repos: 0,
                        bio: `Could not load profile for ${username}.`,
                        avatar_url: ''
                    });
                    continue;
                }

                const userData = result.user;
                const transformedUserData = {
                    login: userData.login,
                    name: userData.name,
                    avatar_url: userData.avatarUrl,
                    bio: userData.bio,
                    followers: userData.followers.totalCount,
                    following: userData.following.totalCount,
                    public_repos: userData.repositories.totalCount,
                    starred_repos: userData.starredRepositories.totalCount
                };

                profiles.push(transformedUserData);
            }

            this.currentUserProfiles = profiles;
            
            // Update profile information (includes validation)
            this.updateProfileInfo(profiles);
            
            // Generate contribution calendars for all years
            await this.generateAllYearsContribution(profiles);
            
            this.hideLoading();
        } catch (error) {
            console.error('Error loading profile:', error);
            this.showError('Failed to load profile data. Check your internet connection and try again.');
        }
    }

    async fetchGitHubAPI(url) {
        const cacheKey = url;
        if (this.apiCache.has(cacheKey)) {
            const cached = this.apiCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 300000) { // 5 minutes cache
                return { 
                    json: () => Promise.resolve(cached.data), 
                    status: cached.status || 200, 
                    ok: (cached.status || 200) < 400,
                    statusText: cached.statusText || 'OK'
                };
            }
        }

        try {
            // Unauthenticated REST fallback (60 requests/hour); the primary
            // data path is the authenticated proxy in fetchFromProxy
            const headers = {
                'Accept': 'application/vnd.github.v3+json'
            };

            const response = await fetch(url, { headers });

            // Cache successful responses
            if (response.ok) {
                try {
                    const data = await response.clone().json();
                    this.apiCache.set(cacheKey, { 
                        data, 
                        timestamp: Date.now(),
                        status: response.status,
                        statusText: response.statusText
                    });
                } catch (jsonError) {
                    console.warn('Failed to parse JSON response for caching:', jsonError);
                }
            }

            return response;
        } catch (error) {
            console.error('API fetch error:', error);
            // Return a proper error response instead of a mock with empty data
            return { 
                ok: false, 
                status: 500, 
                statusText: 'Network Error',
                json: () => Promise.reject(new Error('Network error occurred'))
            };
        }
    }

    async fetchFromProxy(params) {
        const url = `${this.apiBase}?${new URLSearchParams(params)}`;

        try {
            if (this.apiCache.has(url)) {
                const cached = this.apiCache.get(url);
                if (Date.now() - cached.timestamp < 300000) { // 5 minutes cache
                    return cached.data;
                }
            }

            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                console.warn(`Proxy fetch failed: ${response.status} ${response.statusText}`);
                return null;
            }

            const data = await response.json();
            this.apiCache.set(url, { data, timestamp: Date.now() });
            return data;
        } catch (error) {
            console.warn('Proxy fetch error:', error);
            return null;
        }
    }

    updateProfileInfo(usersData) {
        // Validate that usersData is a non-empty array of user objects
        if (!Array.isArray(usersData) || usersData.length === 0 || usersData.some(user => !user || !user.login)) {
            console.error('Invalid user data received:', usersData);
            this.showProfileError('Failed to load user profile data. Please check the usernames and try again.');
            return;
        }

        const avatarStack = this.qs('#profile-avatar-stack');
        const profileUsernameEl = this.qs('#profile-username');
        const followInfoEl = this.qs('#follow-info');
        const followingInfoEl = this.qs('#following-info');
        const bioEl = this.qs('#profile-bio');

        if (avatarStack) {
            avatarStack.innerHTML = '';
            usersData.forEach(user => {
                const avatar = document.createElement('img');
                avatar.className = 'avatar';
                avatar.src = user.avatar_url || '';
                avatar.alt = `${user.login} avatar`;
                avatarStack.appendChild(avatar);
            });
        }

        const githubIconSvg = `
            <svg class="user-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 
                0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52
                -.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2
                -3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.62 
                7.62 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
                1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55
                .38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path>
            </svg>
        `;

        const usernamesLine = usersData
            .map(user => `<span class="user-handle">${githubIconSvg}<span class="handle-text">${user.login}</span></span>`)
            .join('<span class="separator">·</span>');
        if (profileUsernameEl) {
            profileUsernameEl.innerHTML = usernamesLine;
        }

        const buildStatLine = (user) => {
            const formatStat = (value) => String(value || 0);
            const followersIcon = `
                <svg class="followers-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <circle cx="8" cy="5" r="2.1"></circle>
                    <path d="M4.2 11.3 Q 8 9.4 11.8 11.3 Q 10.9 8.8 8 8.8 Q 5.1 8.8 4.2 11.3Z"></path>
                </svg>
            `;
            const followers = `<span class="followers-meta">${followersIcon}<strong class="stat-number">${formatStat(user.followers)}</strong> followers</span>`;
            const followingIcon = `
                <svg class="following-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <circle cx="6" cy="5" r="2"></circle>
                    <path d="M2.6 11.2 Q 6 9.4 9.4 11.2 Q 8.7 9 6 9 Q 3.3 9 2.6 11.2Z"></path>
                    <path d="M9.5 8.3H13.3"></path>
                    <path d="M11.6 6.8L13.3 8.3L11.6 9.8"></path>
                </svg>
            `;
            const following = `<span class="following-meta">${followingIcon}<strong class="stat-number">${formatStat(user.following)}</strong> following</span>`;
            const reposIcon = `
                <svg class="repos-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <path d="M2.7 5.1L5.4 3.7L8 5.1L5.3 6.5L2.7 5.1Z"></path>
                    <path d="M8 5.1L10.6 3.7L13.3 5.1L10.7 6.5L8 5.1Z"></path>
                    <path d="M5.3 6.5V10.8 Q 5.3 11.3 5.8 11.3H10.2 Q 10.7 11.3 10.7 10.8V6.5"></path>
                    <path d="M8 11.3V6.5"></path>
                </svg>
            `;
            const repos = `<span class="repos-meta">${reposIcon}<strong class="stat-number">${formatStat(user.public_repos)}</strong> public repos</span>`;
            const starredIcon = `
                <svg class="starred-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                    <path d="M8 1.3L9.6 5.8L14.5 6.2L11.2 9.8L12 14.7L8 12.3L4 14.7L4.8 9.8L1.5 6.2L6.4 5.8L8 1.3Z"></path>
                </svg>
            `;
            const starred = `<span class="starred-meta">${starredIcon}<strong class="stat-number">${formatStat(user.starred_repos)}</strong> starred</span>`;
            const userTag = `<span class="stat-user">${user.login}</span>`;
            const marker = `<span class="stat-marker">&#x25C9;</span>`;
            return `<span class="stat-text">${userTag}${marker}${followers}${following}${repos}${starred}</span>`;
        };

        const summaries = usersData.map(buildStatLine);

        if (followInfoEl) {
            followInfoEl.innerHTML = summaries[0] || '';
            followInfoEl.style.display = summaries[0] ? '' : 'none';
        }

        if (followingInfoEl) {
            followingInfoEl.innerHTML = summaries[1] || '';
            followingInfoEl.style.display = summaries[1] ? '' : 'none';
        }

        if (bioEl) {
            bioEl.textContent = usersData.length === 1
                ? (usersData[0].bio || '')
                : '';
        }
    }

    async generateAllYearsContribution(usersData) {
        try {
            const container = this.qs('#all-years-container');
            if (!container) return;
            container.innerHTML = '';

            // Show loading message for contributions
            this.showContributionsLoading(container);

            let totalContributions = 0;
            const perUserTotals = {};
            const yearsWithContributions = [];

            // Generate contribution calendar for each year
            for (const year of this.availableYears) {
                const combinedContributionData = {};
                const perUserMaps = {};

                for (const user of usersData) {
                    const contributionData = await this.fetchRealContributionData(user.login, year);
                    perUserMaps[user.login] = contributionData;
                    const yearContributionCount = this.countContributions(contributionData);
                    perUserTotals[user.login] = (perUserTotals[user.login] || 0) + yearContributionCount;
                    this.mergeContributionData(combinedContributionData, contributionData);
                }

                const combinedYearContributions = this.countContributions(combinedContributionData);

                // Add to total contributions regardless of whether year will be displayed
                totalContributions += combinedYearContributions;

                // Only include year if there are contributions
                if (combinedYearContributions > 0) {
                    yearsWithContributions.push({
                        year,
                        combinedContributionData,
                        combinedYearContributions,
                        perUserMaps
                    });
                }
            }

            // Render only years with contributions
            for (const yearData of yearsWithContributions) {
                this.renderYearSection(
                    yearData.year,
                    yearData.combinedContributionData,
                    yearData.combinedYearContributions,
                    container,
                    usersData,
                    yearData.perUserMaps
                );
            }

            // Remove loading message
            this.hideContributionsLoading(container);

            this.updateCommitBreakdown(usersData, perUserTotals, totalContributions);

            // Show message if we couldn't get real data
            if (totalContributions === 0) {
                const usernamesLine = usersData.map(user => user.login).join(' · ');
                this.showContributionDataInfo(usernamesLine);
            }

        } catch (error) {
            console.error('Error loading contributions:', error);
            this.renderEmptyYearSections();
        }
    }

    async fetchRealContributionData(username, year) {
        try {
            // Prefer the proxied contributions calendar for accurate per-day counts
            const calendarData = await this.fetchContributionCalendar(username, year);
            if (calendarData) {
                return calendarData;
            }

            // First try to get repositories
            const reposResponse = await this.fetchGitHubAPI(`https://api.github.com/users/${username}/repos?sort=updated&per_page=100`);
            
            if (reposResponse.status === 403) {
                console.warn(`GitHub API rate limit exceeded while fetching repos for ${username}`);
                return {};
            }

            if (!reposResponse.ok) {
                console.warn(`Failed to fetch repos for ${username}: ${reposResponse.status} ${reposResponse.statusText}`);
                return {};
            }

            const repos = await reposResponse.json();
            
            if (!Array.isArray(repos) || repos.length === 0) {
                return {};
            }
            
            const contributionData = {};
            let totalCommits = 0;
            
            // Process a limited number of repositories to avoid rate limiting
            const reposToProcess = repos.slice(0, 5);
            
            for (const repo of reposToProcess) {
                try {
                    const since = `${year}-01-01T00:00:00Z`;
                    const until = `${year}-12-31T23:59:59Z`;
                    
                    const commitsResponse = await this.fetchGitHubAPI(
                        `https://api.github.com/repos/${username}/${repo.name}/commits?author=${username}&since=${since}&until=${until}&per_page=100`
                    );
                    
                    if (commitsResponse.ok) {
                        const commits = await commitsResponse.json();
                        
                        commits.forEach(commit => {
                            if (commit.commit && commit.commit.author && commit.commit.author.date) {
                                const commitDate = new Date(commit.commit.author.date);
                                if (commitDate.getFullYear() === year) {
                                    const dateStr = commitDate.toISOString().split('T')[0];
                                    contributionData[dateStr] = (contributionData[dateStr] || 0) + 1;
                                    totalCommits++;
                                }
                            }
                        });
                    } else {
                        console.warn(`Failed to fetch commits for ${repo.name}: ${commitsResponse.status}`);
                    }
                } catch (repoError) {
                    console.warn(`Error processing repository ${repo.name}:`, repoError);
                    continue;
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // If we found some real data, return it
            if (totalCommits > 0) {
                return contributionData;
            }
            
            return {};
            
        } catch (error) {
            console.error('Error fetching real contribution data:', error);
            return {};
        }
    }

    mergeContributionData(target, source) {
        Object.entries(source || {}).forEach(([date, count]) => {
            target[date] = (target[date] || 0) + count;
        });
    }

    countContributions(contributionData) {
        return Object.values(contributionData).reduce((sum, count) => sum + count, 0);
    }

    renderYearSection(year, contributionData, totalContributions, container, usersData = [], perUserMaps = {}) {
        const yearSection = document.createElement('div');
        yearSection.className = 'year-section';
        
        // Year header
        const yearHeader = document.createElement('div');
        yearHeader.className = 'year-header';
        yearHeader.textContent = `${year}: ${totalContributions} Contributions`;
        
        // Calendar container
        const calendarContainer = document.createElement('div');
        calendarContainer.className = 'calendar-container';
        
        // Month labels with proper alignment
        const monthsLabels = document.createElement('div');
        monthsLabels.className = 'months-labels';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        months.forEach((month, index) => {
            const monthLabel = document.createElement('span');
            monthLabel.className = 'month-label';
            monthLabel.textContent = month;
            
            // Calculate the width of this month's contribution block
            const monthWidth = this.calculateMonthBlockWidth(year, index);
            monthLabel.style.width = `${monthWidth}px`;
            
            // Add gap between month labels (except for the last one)
            if (index < months.length - 1) {
                monthLabel.style.marginRight = '8px';
            }
            
            monthsLabels.appendChild(monthLabel);
        });
        
        // Calendar grid with day labels
        const calendarGrid = document.createElement('div');
        calendarGrid.className = 'calendar-grid';
        
        // Day labels (S, M, T, W, T, F, S)
        const daysLabels = document.createElement('div');
        daysLabels.className = 'days-labels';
        const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        dayLabels.forEach(day => {
            const dayLabel = document.createElement('span');
            dayLabel.textContent = day;
            daysLabels.appendChild(dayLabel);
        });
        
        // Contribution grid
        const contributionGrid = document.createElement('div');
        contributionGrid.className = 'contribution-grid';
        
        this.renderContributionGridByMonths(contributionData, contributionGrid, year, usersData, perUserMaps);
        
        calendarGrid.appendChild(daysLabels);
        calendarGrid.appendChild(contributionGrid);
        
        calendarContainer.appendChild(monthsLabels);
        calendarContainer.appendChild(calendarGrid);
        
        yearSection.appendChild(yearHeader);
        yearSection.appendChild(calendarContainer);
        
        container.appendChild(yearSection);
    }

    updateCommitBreakdown(usersData, perUserTotals, totalContributions) {
        const breakdown = this.qs('#user-commit-breakdown');
        if (breakdown) {
            breakdown.innerHTML = '';
            usersData.forEach((user, index) => {
                const pill = document.createElement('div');
                pill.className = 'commit-pill';

                const avatarLink = document.createElement('a');
                avatarLink.href = `https://github.com/${user.login}`;
                avatarLink.target = '_blank';

                const avatar = document.createElement('img');
                avatar.src = user.avatar_url || '';
                avatar.alt = `${user.login} avatar`;

                avatarLink.appendChild(avatar);

                const meta = document.createElement('div');
                meta.className = 'pill-meta';

                const username = document.createElement('div');
                username.className = 'pill-username';
                username.textContent = `${user.login}`;

                const role = document.createElement('div');
                role.className = 'pill-role';
                role.textContent = index === 0 ? 'Primary' : 'Secondary';

                const count = document.createElement('div');
                count.className = 'pill-count';
                count.textContent = `${perUserTotals[user.login] || 0} commits`;

                meta.appendChild(username);
                meta.appendChild(role);
                meta.appendChild(count);

                pill.appendChild(avatarLink);
                pill.appendChild(meta);

                breakdown.appendChild(pill);
            });
        }

    }

    renderContributionGridByMonths(contributionData, grid, year, usersData = [], perUserMaps = {}) {
        
        grid.innerHTML = '';
        
        // Create month blocks
        for (let month = 0; month < 12; month++) {
            const monthBlock = document.createElement('div');
            monthBlock.className = 'month-block';
            
            const monthStartDate = new Date(year, month, 1);
            const monthEndDate = new Date(year, month + 1, 0);
            
            // Get the first Sunday of the week containing the first day of the month
            const firstDayOfWeek = monthStartDate.getDay(); // 0 = Sunday
            const startDate = new Date(monthStartDate);
            startDate.setDate(startDate.getDate() - firstDayOfWeek);
            
            // Calculate end date to complete the grid (next Saturday)
            const endDate = new Date(monthEndDate);
            const lastDayOfWeek = endDate.getDay();
            const saturdayOffset = lastDayOfWeek === 6 ? 0 : 6 - lastDayOfWeek;
            endDate.setDate(endDate.getDate() + saturdayOffset);
            
            let currentDate = new Date(startDate);
            
            while (currentDate <= endDate) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const perUserCounts = {};
                usersData.forEach(user => {
                    perUserCounts[user.login] = (perUserMaps[user.login] && perUserMaps[user.login][dateStr]) || 0;
                });
                const contributionCount = contributionData[dateStr] || 0;
                const level = currentDate.getMonth() === month ? this.getContributionLevel(contributionCount) : 0;
                
                const dayElement = document.createElement('div');
                dayElement.className = `contribution-day level-${level}`;
                dayElement.title = this.buildDayTooltip(dateStr, perUserCounts, usersData);
                dayElement.dataset.date = dateStr;
                dayElement.dataset.count = contributionCount;
                dayElement.dataset.users = JSON.stringify(perUserCounts);
                
                // Dim days outside current month
                if (currentDate.getMonth() !== month) {
                    dayElement.style.opacity = '0.2';
                }
                
                dayElement.addEventListener('click', (event) => {
                    if (contributionCount > 0) {
                        this.showActivityTooltip(dateStr, perUserCounts, usersData, event.currentTarget);
                    } else {
                        this.hideActivityTooltip();
                    }
                });
                
                monthBlock.appendChild(dayElement);
                
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            grid.appendChild(monthBlock);
        }
    }

    renderEmptyYearSections() {
        const container = this.qs('#all-years-container');
        container.innerHTML = '';
        
        // Show current year with empty data
        const contributionData = {};
        this.renderYearSection(this.currentYear, contributionData, 0, container, this.currentUserProfiles, {});
        
    }

    getContributionLevel(count) {
        if (count === 0) return 0;
        if (count <= 2) return 1;
        if (count <= 5) return 2;
        if (count <= 8) return 3;
        return 4;
    }

    calculateMonthBlockWidth(year, monthIndex) {
        // Calculate the width of a month block based on the number of weeks it spans
        const monthStartDate = new Date(year, monthIndex, 1);
        const monthEndDate = new Date(year, monthIndex + 1, 0);
        
        // Get the first Sunday of the week containing the first day of the month
        const firstDayOfWeek = monthStartDate.getDay(); // 0 = Sunday
        const startDate = new Date(monthStartDate);
        startDate.setDate(startDate.getDate() - firstDayOfWeek);
        
        // Calculate end date to complete the grid (next Saturday)
        const endDate = new Date(monthEndDate);
        const lastDayOfWeek = endDate.getDay();
        const saturdayOffset = lastDayOfWeek === 6 ? 0 : 6 - lastDayOfWeek;
        endDate.setDate(endDate.getDate() + saturdayOffset);
        
        // Calculate the number of weeks (columns) in this month
        const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1;
        const numberOfWeeks = Math.ceil(totalDays / 7);
        
        // Each week column is 10px (day width) + 3px gap between days, but no gap after the last week
        // Width = (number of weeks * day width) + (number of gaps between weeks * gap width)
        const dayWidth = 10;
        const gapWidth = 3;
        
        // For a week column, we have 7 days with gaps between them (6 gaps)
        // But the month block uses grid-auto-flow: column, so each column is one week
        // The actual width is: number of weeks * (day width) + (number of weeks - 1) * column gap
        return numberOfWeeks * dayWidth + (numberOfWeeks - 1) * gapWidth;
    }

    buildDayTooltip(dateStr, perUserCounts = {}, usersData = []) {
        const lines = [];
        usersData.forEach(user => {
            const count = perUserCounts[user.login] || 0;
            if (count > 0) {
                const label = count === 1 ? 'contribution' : 'contributions';
                lines.push(`${user.login}: ${count} ${label}`);
            }
        });

        if (lines.length === 0) {
            return `No contributions on ${dateStr}`;
        }

        return `${lines.join('\n')}\n${dateStr}`;
    }

    showLoading() {}

    hideLoading() {}

    showError(message) {
        console.warn(message);
        this.hideLoading();
    }

    showProfileError(message) {
        // Display error in profile section instead of generic alert
        const usernameEl = this.qs('#profile-username');
        const followInfoEl = this.qs('#follow-info');
        const followingInfoEl = this.qs('#following-info');
        const bioEl = this.qs('#profile-bio');
        const avatarStack = this.qs('#profile-avatar-stack');

        if (usernameEl) usernameEl.textContent = 'unknown';
        if (followInfoEl) {
            followInfoEl.textContent = 'Profile stats unavailable';
            followInfoEl.style.display = 'block';
            followInfoEl.style.gridColumn = '1 / -1';
        }
        if (followingInfoEl) {
            followingInfoEl.textContent = '';
            followingInfoEl.style.display = 'none';
        }
        if (bioEl) bioEl.textContent = message;
        if (avatarStack) avatarStack.innerHTML = '';
        this.hideLoading();
    }

    showContributionDataInfo(username) {
        // Add an informational message when no contribution data is available
        const container = this.qs('#all-years-container');
        if (!container) return;
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = `
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 20px;
            color: #856404;
            font-size: 14px;
            line-height: 1.5;
        `;
        infoDiv.innerHTML = `
            <strong>⚠️ No contribution data found</strong><br>
            This could be because:<br>
            • The /api/github proxy is unavailable (e.g. running via "python -m http.server" instead of "node server.js")<br>
            • The GitHub API rate limit has been exceeded<br>
            • The user has no public contributions in the selected time range<br>
            <br>
            <strong>💡 To see more accurate data:</strong><br>
            Data usually recovers on its own; retry after a short wait.
        `;
        container.insertBefore(infoDiv, container.firstChild);
    }

    showContributionsLoading(container) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'contributions-loading';
        loadingDiv.style.cssText = `
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 40px;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
        `;
        loadingDiv.innerHTML = `
            <div style="margin-bottom: 12px;">🔄</div>
            <div><strong>Loading contribution data...</strong></div>
            <div>This may take a moment while we fetch your GitHub activity</div>
        `;
        container.appendChild(loadingDiv);
    }

    hideContributionsLoading(container) {
        const loadingDiv = this.qs('#contributions-loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    setupGlobalListeners() {
        document.addEventListener('click', (event) => {
            if (this.activeTooltip && !this.activeTooltip.contains(event.target)) {
                this.hideActivityTooltip();
            }
        });
    }

    showActivityTooltip(dateStr, perUserCounts, usersData, anchorElement) {
        this.hideActivityTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'activity-tooltip';

        const title = document.createElement('div');
        title.className = 'tooltip-title';
        const readableDate = new Date(dateStr).toDateString();
        title.textContent = `${readableDate}`;
        tooltip.appendChild(title);

        usersData.forEach(user => {
            const commitCount = perUserCounts[user.login] || 0;
            if (commitCount === 0) return;
            const row = document.createElement('div');
            row.className = 'user-row';

            const avatar = document.createElement('img');
            avatar.src = user.avatar_url || '';
            avatar.alt = `${user.login} avatar`;

            const meta = document.createElement('div');
            meta.className = 'user-meta';

            const handle = document.createElement('div');
            handle.className = 'user-handle';
            handle.textContent = `${user.login}`;

            const activity = document.createElement('div');
            activity.className = 'user-activity';
            activity.textContent = `${commitCount} commits, 0 PRs merged`;

            meta.appendChild(handle);
            meta.appendChild(activity);

            row.appendChild(avatar);
            row.appendChild(meta);

            tooltip.appendChild(row);
        });

        document.body.appendChild(tooltip);
        this.activeTooltip = tooltip;

        const rect = anchorElement.getBoundingClientRect();
        const top = rect.top + window.scrollY - tooltip.offsetHeight - 8;
        const left = rect.left + window.scrollX + rect.width + 8;
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }

    hideActivityTooltip() {
        if (this.activeTooltip) {
            this.activeTooltip.remove();
            this.activeTooltip = null;
        }
    }

    async fetchContributionCalendar(username, year) {
        const result = await this.fetchFromProxy({ type: 'contributions', user: username, year });

        if (!result) {
            return null;
        }

        const weeks = result?.user?.contributionsCollection?.contributionCalendar?.weeks || [];
        const contributionData = {};
        weeks.forEach(week => {
            week.contributionDays.forEach(day => {
                if (day.date) {
                    contributionData[day.date] = day.contributionCount || 0;
                }
            });
        });

        return contributionData;
    }
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GitHubDashboard();
});
