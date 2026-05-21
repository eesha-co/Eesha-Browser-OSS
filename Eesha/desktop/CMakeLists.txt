cmake_minimum_required(VERSION 3.21)
project(Eesha VERSION 0.2.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

# CEF configuration
set(CEF_VERSION "131.2.1+g5607e7c+chromium-131.0.6778.69")

# Platform-specific CEF root detection
if(APPLE)
    set(CEF_ROOT "" CACHE PATH "CEF root directory")
    if(NOT CEF_ROOT)
        # Download CEF if not provided
        message(STATUS "CEF_ROOT not set, will download CEF binary distribution")
    endif()
elseif(WIN32)
    set(CEF_ROOT "" CACHE PATH "CEF root directory")
else()
    set(CEF_ROOT "" CACHE PATH "CEF root directory")
endif()

# Download CEF binary distribution if not provided
include(cmake/DownloadCEF.cmake)

# CEF includes and libraries
if(CEF_ROOT)
    include(${CEF_ROOT}/cmake/cef_variables.cmake)
endif()

add_executable(eesha WIN32 MACOSX_BUNDLE
    src/main.cpp
    src/browser_app.cpp
    src/browser_client.cpp
    src/browser_window.cpp
    src/window_delegate.cpp
)

target_include_directories(eesha PRIVATE
    ${CEF_ROOT}
    ${CMAKE_SOURCE_DIR}/include
)

target_link_libraries(eesha PRIVATE
    ${CEF_LIBRARIES}
)

# Copy resources
add_custom_command(TARGET eesha POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_SOURCE_DIR}/resources
        $<TARGET_FILE_DIR:eesha>/resources
)

# Install rules
install(TARGETS eesha RUNTIME DESTINATION bin)
install(DIRECTORY resources/ DESTINATION share/eesha/resources)
