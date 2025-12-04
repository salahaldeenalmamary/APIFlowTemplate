class GenericAPICollector {
    constructor() {
        this.baseUrl = 'https://jsonplaceholder.typicode.com';
        this.authType = 'bearer';
        this.tokenLocation = 'header';
        this.token = null;
        this.tokenParamName = 'Authorization';
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        this.enableRateLimit = false;
        this.requestCount = 0;
        this.requestHistory = [];
        this.currentConfig = {};
        
        this.init();
    }

    init() {
        this.loadFromStorage();
        this.bindEvents();
        this.updateUI();
        this.showNotification('API Collector Ready!', 'success');
    }

    bindEvents() {
        // Configuration
        document.getElementById('saveConfig').addEventListener('click', () => this.saveConfig());
        document.getElementById('baseUrl').addEventListener('input', (e) => this.updateBaseUrlPreview(e.target.value));
        
        // Request Builder
        document.getElementById('sendRequest').addEventListener('click', () => this.sendRequest());
        document.getElementById('testRequest').addEventListener('click', () => this.testConnection());
        document.getElementById('addParam').addEventListener('click', () => this.addParamField());
        document.getElementById('addHeader').addEventListener('click', () => this.addHeaderField());
        
        // Token Management
        document.getElementById('setToken').addEventListener('click', () => this.setToken());
        document.getElementById('clearToken').addEventListener('click', () => this.clearToken());
        document.getElementById('rotateToken').addEventListener('click', () => this.rotateToken());
        document.getElementById('breakToken').addEventListener('click', () => this.breakToken());
        
        // History
        document.getElementById('clearHistory').addEventListener('click', () => this.clearHistory());
        document.getElementById('copyResponse').addEventListener('click', () => this.copyToClipboard('responseDetails'));
        document.getElementById('copyCurl').addEventListener('click', () => this.copyToClipboard('curlCommand'));
        
        // Dynamic removal of param/header fields
        document.addEventListener('click', (e) => {
            if (e.target.closest('.remove-param')) {
                e.target.closest('.input-group').remove();
            }
            if (e.target.closest('.remove-header')) {
                e.target.closest('.input-group').remove();
            }
        });
        
        // Update preview when config changes
        document.getElementById('authType').addEventListener('change', () => this.updateTokenDisplay());
        document.getElementById('tokenLocation').addEventListener('change', () => this.updateTokenDisplay());
        document.getElementById('tokenParamName').addEventListener('input', () => this.updateTokenDisplay());
    }

    saveConfig() {
        this.baseUrl = document.getElementById('baseUrl').value.trim();
        this.authType = document.getElementById('authType').value;
        this.tokenLocation = document.getElementById('tokenLocation').value;
        
        try {
            const headersText = document.getElementById('defaultHeaders').value;
            this.defaultHeaders = JSON.parse(headersText);
        } catch (e) {
            this.showNotification('Invalid JSON in headers', 'danger');
            return;
        }
        
        this.enableRateLimit = document.getElementById('enableRateLimit').checked;
        
        this.saveToStorage();
        this.updateUI();
        this.showNotification('Configuration saved!', 'success');
    }

    updateUI() {
        document.getElementById('baseUrlPreview').textContent = this.baseUrl || 'https://api.example.com';
        document.getElementById('currentAuthType').textContent = this.authType.charAt(0).toUpperCase() + this.authType.slice(1);
        document.getElementById('currentTokenLocation').textContent = this.tokenLocation.charAt(0).toUpperCase() + this.tokenLocation.slice(1);
        document.getElementById('currentTokenParam').textContent = this.tokenParamName;
        document.getElementById('currentToken').textContent = this.token ? 
            (this.token.length > 50 ? this.token.substring(0, 50) + '...' : this.token) : 
            'Not Set';
        document.getElementById('requestCounter').textContent = `Requests: ${this.requestCount}`;
        
        this.updateRequestHistoryList();
    }

    updateTokenDisplay() {
        const tokenParamName = document.getElementById('tokenParamName').value;
        const authType = document.getElementById('authType').value;
        const tokenLocation = document.getElementById('tokenLocation').value;
        
        document.getElementById('currentTokenParam').textContent = tokenParamName || 'Authorization';
        document.getElementById('currentAuthType').textContent = authType.charAt(0).toUpperCase() + authType.slice(1);
        document.getElementById('currentTokenLocation').textContent = tokenLocation.charAt(0).toUpperCase() + tokenLocation.slice(1);
    }

    async sendRequest() {
        const method = document.getElementById('httpMethod').value;
        const endpoint = document.getElementById('endpoint').value.trim();
        const breakAfter = parseInt(document.getElementById('breakAfter').value) || null;
        
        if (!endpoint) {
            this.showNotification('Please enter an endpoint', 'warning');
            return;
        }

        // Collect parameters
        const params = this.collectParams();
        
        // Collect custom headers
        const customHeaders = this.collectHeaders();
        
        // Get request body
        let body = null;
        try {
            const bodyText = document.getElementById('requestBody').value.trim();
            if (bodyText) {
                body = JSON.parse(bodyText);
            }
        } catch (e) {
            this.showNotification('Invalid JSON in request body', 'danger');
            return;
        }

        // Build headers
        const headers = { ...this.defaultHeaders, ...customHeaders };
        
        // Add token to request
        if (this.token) {
            this.addTokenToRequest(headers, params, body);
        }

        // Show loading
        this.showLoading(true);

        try {
            // Rate limiting
            if (this.enableRateLimit) {
                await this.delay(1000);
            }

            // Check for token break
            if (breakAfter && this.requestCount >= breakAfter) {
                this.token = null;
                this.showNotification('Token broken after ' + breakAfter + ' requests', 'warning');
            }

            // Make request
            const url = this.baseUrl + endpoint;
            const options = {
                method: method,
                headers: headers,
                ...(params && Object.keys(params).length > 0 && { params: params })
            };

            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(url, options);
            const responseTime = new Date();
            
            // Update request count
            this.requestCount++;
            
            // Get response data
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            // Save to history
            this.saveToHistory({
                method,
                endpoint,
                url,
                status: response.status,
                statusText: response.statusText,
                time: responseTime.toISOString(),
                requestHeaders: headers,
                requestBody: body,
                response: data,
                tokenUsed: !!this.token,
                tokenBroken: breakAfter && this.requestCount >= breakAfter
            });

            // Update response display
            this.updateResponseDisplay(response, data);
            
            // Generate curl command
            this.generateCurlCommand(method, url, headers, body, params);
            
            // Update debug info
            this.updateDebugInfo(response, options);
            
            this.showNotification(`Request successful! Status: ${response.status}`, 'success');

        } catch (error) {
            this.showNotification(`Request failed: ${error.message}`, 'danger');
            document.getElementById('responseOutput').textContent = `Error: ${error.message}`;
            document.getElementById('responseStatus').textContent = 'Status: Error';
            document.getElementById('responseStatus').className = 'badge bg-danger';
        } finally {
            this.showLoading(false);
            this.updateUI();
        }
    }

    addTokenToRequest(headers, params, body) {
        const authType = document.getElementById('authType').value;
        const tokenLocation = document.getElementById('tokenLocation').value;
        const tokenParamName = document.getElementById('tokenParamName').value || 'Authorization';
        
        let tokenValue = this.token;
        
        // Format token based on auth type
        if (authType === 'bearer') {
            tokenValue = `Bearer ${this.token}`;
        } else if (authType === 'basic') {
            tokenValue = `Basic ${this.token}`;
        }
        
        // Add token to appropriate location
        if (tokenLocation === 'header') {
            headers[tokenParamName] = tokenValue;
        } else if (tokenLocation === 'query') {
            params[tokenParamName] = tokenValue;
        } else if (tokenLocation === 'body') {
            if (!body) body = {};
            body[tokenParamName] = tokenValue;
        }
    }

    collectParams() {
        const params = {};
        const paramGroups = document.querySelectorAll('.param-key');
        
        paramGroups.forEach((input, index) => {
            const keyInput = input;
            const valueInput = document.querySelectorAll('.param-value')[index];
            
            if (keyInput.value.trim() && valueInput.value.trim()) {
                params[keyInput.value.trim()] = valueInput.value.trim();
            }
        });
        
        return params;
    }

    collectHeaders() {
        const headers = {};
        const headerGroups = document.querySelectorAll('.header-key');
        
        headerGroups.forEach((input, index) => {
            const keyInput = input;
            const valueInput = document.querySelectorAll('.header-value')[index];
            
            if (keyInput.value.trim() && valueInput.value.trim()) {
                headers[keyInput.value.trim()] = valueInput.value.trim();
            }
        });
        
        return headers;
    }

    addParamField() {
        const container = document.querySelector('#request .col-md-6:first-child .mb-2');
        const inputGroup = document.createElement('div');
        inputGroup.className = 'input-group mb-1';
        inputGroup.innerHTML = `
            <input type="text" class="form-control param-key" placeholder="Key">
            <input type="text" class="form-control param-value" placeholder="Value">
            <button class="btn btn-outline-secondary remove-param" type="button">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(inputGroup);
    }

    addHeaderField() {
        const container = document.querySelector('#request .col-md-6:first-child .mb-2:nth-child(3)');
        const inputGroup = document.createElement('div');
        inputGroup.className = 'input-group mb-1';
        inputGroup.innerHTML = `
            <input type="text" class="form-control header-key" placeholder="Header Name">
            <input type="text" class="form-control header-value" placeholder="Header Value">
            <button class="btn btn-outline-secondary remove-header" type="button">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(inputGroup);
    }

    updateResponseDisplay(response, data) {
        const responseOutput = document.getElementById('responseOutput');
        const responseStatus = document.getElementById('responseStatus');
        
        responseStatus.textContent = `Status: ${response.status} ${response.statusText}`;
        responseStatus.className = response.ok ? 'badge bg-success' : 'badge bg-danger';
        
        responseOutput.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }

    generateCurlCommand(method, url, headers, body, params) {
        let curl = `curl -X ${method} \\\n  '${url}'`;
        
        // Add headers
        Object.entries(headers).forEach(([key, value]) => {
            curl += ` \\\n  -H '${key}: ${value}'`;
        });
        
        // Add query parameters
        if (params && Object.keys(params).length > 0) {
            const urlObj = new URL(url);
            Object.entries(params).forEach(([key, value]) => {
                urlObj.searchParams.append(key, value);
            });
            curl = curl.replace(url, urlObj.toString());
        }
        
        // Add body
        if (body) {
            curl += ` \\\n  -d '${JSON.stringify(body)}'`;
        }
        
        document.getElementById('curlCommand').textContent = curl;
    }

    updateDebugInfo(response, options) {
        const debugInfo = document.getElementById('debugInfo');
        debugInfo.innerHTML = `
            <div class="row">
                <div class="col-6">
                    <strong>Request Time:</strong> ${new Date().toLocaleTimeString()}<br>
                    <strong>Request Method:</strong> ${options.method}<br>
                    <strong>Content-Type:</strong> ${options.headers['Content-Type'] || 'Not specified'}<br>
                    <strong>Token Used:</strong> ${this.token ? 'Yes' : 'No'}
                </div>
                <div class="col-6">
                    <strong>Response Time:</strong> ${response.headers.get('date') || 'N/A'}<br>
                    <strong>Content-Length:</strong> ${response.headers.get('content-length') || 'N/A'}<br>
                    <strong>Rate Limit Remaining:</strong> ${response.headers.get('x-ratelimit-remaining') || 'N/A'}<br>
                    <strong>Token Broken:</strong> ${document.getElementById('breakAfter').value && this.requestCount >= parseInt(document.getElementById('breakAfter').value) ? 'Yes' : 'No'}
                </div>
            </div>
        `;
    }

    setToken() {
        const tokenInput = document.getElementById('tokenInput').value.trim();
        if (!tokenInput) {
            this.showNotification('Please enter a token', 'warning');
            return;
        }
        
        this.token = tokenInput;
        this.tokenParamName = document.getElementById('tokenParamName').value || 'Authorization';
        this.saveToStorage();
        this.updateUI();
        this.showNotification('Token set successfully!', 'success');
    }

    clearToken() {
        this.token = null;
        this.saveToStorage();
        this.updateUI();
        this.showNotification('Token cleared!', 'info');
    }

    rotateToken() {
        if (!this.token) {
            this.showNotification('No token to rotate', 'warning');
            return;
        }
        
        // Generate a fake rotated token (in real app, this would come from your token rotation logic)
        const newToken = 'rotated_' + this.token.substring(0, Math.min(20, this.token.length)) + '_' + Date.now();
        this.token = newToken;
        document.getElementById('tokenInput').value = newToken;
        this.saveToStorage();
        this.updateUI();
        this.showNotification('Token rotated!', 'success');
    }

    breakToken() {
        this.token = null;
        this.requestCount = 0;
        this.updateUI();
        this.showNotification('Token broken! All tokens cleared.', 'danger');
    }

    saveToHistory(requestData) {
        this.requestHistory.unshift(requestData);
        if (this.requestHistory.length > 50) {
            this.requestHistory.pop();
        }
        this.saveToStorage();
        this.updateRequestHistoryList();
    }

    updateRequestHistoryList() {
        const historyList = document.getElementById('requestHistoryList');
        historyList.innerHTML = '';
        
        this.requestHistory.forEach((req, index) => {
            const item = document.createElement('a');
            item.href = '#';
            item.className = 'list-group-item list-group-item-action request-item';
            item.innerHTML = `
                <div class="d-flex w-100 justify-content-between">
                    <strong>${req.method} ${req.endpoint}</strong>
                    <span class="badge ${req.status >= 400 ? 'bg-danger' : 'bg-success'} status-badge">
                        ${req.status}
                    </span>
                </div>
                <small class="text-muted">${new Date(req.time).toLocaleTimeString()}</small>
                <div class="mt-1">
                    <span class="badge ${req.tokenUsed ? 'bg-primary' : 'bg-secondary'}">Token: ${req.tokenUsed ? 'Yes' : 'No'}</span>
                    ${req.tokenBroken ? '<span class="badge bg-warning">Broken</span>' : ''}
                </div>
            `;
            
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.displayRequestDetails(req);
            });
            
            historyList.appendChild(item);
        });
    }

    displayRequestDetails(request) {
        const details = document.getElementById('responseDetails');
        const detailsText = JSON.stringify({
            method: request.method,
            url: request.url,
            status: request.status,
            statusText: request.statusText,
            time: request.time,
            requestHeaders: request.requestHeaders,
            requestBody: request.requestBody,
            response: request.response,
            tokenUsed: request.tokenUsed,
            tokenBroken: request.tokenBroken
        }, null, 2);
        
        details.textContent = detailsText;
    }

    clearHistory() {
        this.requestHistory = [];
        this.saveToStorage();
        this.updateRequestHistoryList();
        document.getElementById('responseDetails').textContent = 'Select a request from history to view details';
        this.showNotification('History cleared!', 'info');
    }

    async testConnection() {
        const originalEndpoint = document.getElementById('endpoint').value;
        document.getElementById('endpoint').value = '/';
        
        try {
            await this.sendRequest();
        } finally {
            document.getElementById('endpoint').value = originalEndpoint;
        }
    }

    updateBaseUrlPreview(url) {
        document.getElementById('baseUrlPreview').textContent = url || 'https://api.example.com';
    }

    showNotification(message, type = 'info') {
        const toast = document.getElementById('notificationToast');
        const toastBody = toast.querySelector('.toast-body');
        const toastHeader = toast.querySelector('.toast-header strong');
        
        toastBody.textContent = message;
        toast.className = `toast ${type === 'success' ? 'bg-success text-white' : type === 'danger' ? 'bg-danger text-white' : 'bg-dark text-white'}`;
        
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    }

    showLoading(show) {
        const sendBtn = document.getElementById('sendRequest');
        const testBtn = document.getElementById('testRequest');
        
        if (show) {
            sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Sending...';
            sendBtn.disabled = true;
            testBtn.disabled = true;
        } else {
            sendBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>Send Request';
            sendBtn.disabled = false;
            testBtn.disabled = false;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    copyToClipboard(elementId) {
        const text = document.getElementById(elementId).textContent;
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Copied to clipboard!', 'success');
        });
    }

    saveToStorage() {
        const data = {
            baseUrl: this.baseUrl,
            authType: this.authType,
            tokenLocation: this.tokenLocation,
            token: this.token,
            tokenParamName: this.tokenParamName,
            defaultHeaders: this.defaultHeaders,
            enableRateLimit: this.enableRateLimit,
            requestCount: this.requestCount,
            requestHistory: this.requestHistory
        };
        
        localStorage.setItem('apiCollectorConfig', JSON.stringify(data));
    }

    loadFromStorage() {
        const saved = localStorage.getItem('apiCollectorConfig');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                Object.assign(this, data);
                
                // Update form fields
                document.getElementById('baseUrl').value = this.baseUrl;
                document.getElementById('authType').value = this.authType;
                document.getElementById('tokenLocation').value = this.tokenLocation;
                document.getElementById('tokenInput').value = this.token || '';
                document.getElementById('tokenParamName').value = this.tokenParamName;
                document.getElementById('defaultHeaders').value = JSON.stringify(this.defaultHeaders, null, 2);
                document.getElementById('enableRateLimit').checked = this.enableRateLimit;
            } catch (e) {
                console.error('Failed to load saved configuration:', e);
            }
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.apiCollector = new GenericAPICollector();
});